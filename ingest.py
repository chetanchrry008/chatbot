from dotenv import load_dotenv
import os
import time

from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from pinecone import Pinecone, ServerlessSpec

load_dotenv()

# Configuration
google_api_key = os.getenv("GOOGLE_API_KEY")
pinecone_api_key = os.getenv("PINECONE_API_KEY")
index_name = os.getenv("PINECONE_INDEX")


if not google_api_key or not pinecone_api_key or not index_name:
    print("Error: Missing environment variables. Please check your .env file.")
    exit(1)

# Load PDF
pdf_path = "data/borewell_pumps_chatbot_knowledge_base .pdf"
print(f"Loading PDF: {pdf_path}")
if not os.path.exists(pdf_path):
    print(f"Error: File not found: {pdf_path}")
    exit(1)

loader = PyPDFLoader(pdf_path)
documents = loader.load()

# Split into chunks
print(f"Splitting {len(documents)} pages into chunks...")
splitter = RecursiveCharacterTextSplitter(
    chunk_size=1000,
    chunk_overlap=100
)
docs = splitter.split_documents(documents)

# Embeddings
print("Initializing Google Embeddings (gemini-embedding-001)...")
embeddings = GoogleGenerativeAIEmbeddings(
    model="models/gemini-embedding-001", 
    google_api_key=google_api_key
)

# Pinecone setup
print("Connecting to Pinecone...")
pc = Pinecone(api_key=pinecone_api_key)

# Check and manage index
target_dimension = 3072
existing_indexes = [idx.name for idx in pc.list_indexes()]

if index_name in existing_indexes:
    desc = pc.describe_index(index_name)
    if desc.dimension != target_dimension:
        print(f"Index '{index_name}' has dimension {desc.dimension}, but we need {target_dimension}. Recreating...")
        pc.delete_index(index_name)
        while index_name in [idx.name for idx in pc.list_indexes()]:
            time.sleep(1)
        existing_indexes.remove(index_name)

if index_name not in existing_indexes:
    print(f"Creating index '{index_name}' with dimension {target_dimension}...")
    pc.create_index(
        name=index_name,
        dimension=target_dimension,
        metric="cosine",
        spec=ServerlessSpec(
            cloud="aws",
            region="us-east-1"
        )
    )
    # Wait for index to be ready
    while not pc.describe_index(index_name).status['ready']:
        print("Waiting for index to be ready...")
        time.sleep(2)
else:
    print(f"Index '{index_name}' is ready.")

index = pc.Index(index_name)

# Upload vectors in batches
print(f"Uploading {len(docs)} document chunks to Pinecone...")
batch_size = 50
for i in range(0, len(docs), batch_size):
    batch = docs[i:i + batch_size]
    texts = [doc.page_content for doc in batch]
    metadatas = [{"text": doc.page_content} for doc in batch]
    ids = [f"chunk_{j}" for j in range(i, i + len(batch))]
    
    try:
        vectors = embeddings.embed_documents(texts)
        upsert_data = list(zip(ids, vectors, metadatas))
        index.upsert(vectors=upsert_data)
        print(f"Uploaded batch {i // batch_size + 1} ({len(batch)} chunks)")
    except Exception as e:
        print(f"Error uploading batch: {e}")

print("Documents uploaded successfully!")