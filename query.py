from fastapi import FastAPI, HTTPException, Depends, status, UploadFile, File, Form, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr
from dotenv import load_dotenv
import os
import shutil
from datetime import datetime
from bson import ObjectId
from typing import Optional, List

from langchain_google_genai import GoogleGenerativeAIEmbeddings, ChatGoogleGenerativeAI
from langchain_text_splitters import RecursiveCharacterTextSplitter
from pinecone import Pinecone

# New imports for auth
from database import users_collection, datasets_collection, history_collection, init_db
from auth_utils import get_password_hash, verify_password, create_access_token, ALGORITHM, SECRET_KEY
from jose import JWTError, jwt

load_dotenv()

app = FastAPI()

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_event():
    await init_db()

# Configuration
google_api_key = os.getenv("GOOGLE_API_KEY") or os.getenv("OPENAI_API_KEY")
pinecone_api_key = os.getenv("PINECONE_API_KEY")
index_name = os.getenv("PINECONE_INDEX")

if not google_api_key or not pinecone_api_key or not index_name:
    print("Error: Missing environment variables in .env")

# Initialize components
print("Initializing Embeddings and Pinecone...")
embeddings = GoogleGenerativeAIEmbeddings(
    model="models/gemini-embedding-001", 
    google_api_key=google_api_key
)

pc = Pinecone(api_key=pinecone_api_key)
index = pc.Index(index_name)

print("Initializing Gemini LLM...")
llm = ChatGoogleGenerativeAI(
    model="gemini-flash-latest", 
    google_api_key=google_api_key
)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")

# Pydantic models
class UserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: Optional[str] = None

class UserResponse(BaseModel):
    id: str
    email: EmailStr
    full_name: Optional[str] = None
    is_admin: Optional[bool] = False

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str

class QueryRequest(BaseModel):
    question: str

# Auth endpoints
@app.post("/signup", response_model=UserResponse)
async def signup(user: UserCreate):
    # Enforce admin password constraint if trying to register admin@chatbot.com
    if user.email == "admin@chatbot.com" and user.password != "jijiaraj":
        raise HTTPException(
            status_code=400, 
            detail="The designated password for admin@chatbot.com is fixed as 'jijiaraj'."
        )

    db_user = await users_collection.find_one({"email": user.email})
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    hashed_password = get_password_hash(user.password)
    is_admin = user.email == "admin@chatbot.com" or user.email.endswith("@admin.com")
    new_user = {
        "email": user.email,
        "hashed_password": hashed_password,
        "full_name": user.full_name,
        "is_admin": is_admin
    }
    result = await users_collection.insert_one(new_user)
    
    return {
        "id": str(result.inserted_id),
        "email": user.email,
        "full_name": user.full_name,
        "is_admin": is_admin
    }

@app.post("/login", response_model=Token)
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    # Custom fixed password validation for admin
    if form_data.username == "admin@chatbot.com":
        if form_data.password != "jijiaraj":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect email or password",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        # Ensure admin user is seeded/saved in database
        user = await users_collection.find_one({"email": "admin@chatbot.com"})
        if not user:
            hashed_password = get_password_hash("jijiaraj")
            new_admin = {
                "email": "admin@chatbot.com",
                "hashed_password": hashed_password,
                "full_name": "System Administrator",
                "is_admin": True
            }
            await users_collection.insert_one(new_admin)
            user = await users_collection.find_one({"email": "admin@chatbot.com"})
    else:
        user = await users_collection.find_one({"email": form_data.username})
        if not user or not verify_password(form_data.password, user["hashed_password"]):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect email or password",
                headers={"WWW-Authenticate": "Bearer"},
            )
    
    access_token = create_access_token(data={"sub": user["email"]})
    return {"access_token": access_token, "token_type": "bearer"}

async def get_current_user(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    user = await users_collection.find_one({"email": email})
    if user is None:
        raise credentials_exception
    return user

@app.get("/me", response_model=UserResponse)
async def read_users_me(current_user: dict = Depends(get_current_user)):
    is_admin = current_user.get("is_admin", False) or current_user["email"] == "admin@chatbot.com" or current_user["email"].endswith("@admin.com")
    return {
        "id": str(current_user["_id"]),
        "email": current_user["email"],
        "full_name": current_user.get("full_name"),
        "is_admin": is_admin
    }

@app.post("/chat")
async def chat(request: QueryRequest, authorization: Optional[str] = Header(None)):
    try:
        # Optional auth identification to save question history
        user_email = None
        if authorization and authorization.startswith("Bearer "):
            try:
                jwt_token = authorization.split(" ")[1]
                payload = jwt.decode(jwt_token, SECRET_KEY, algorithms=[ALGORITHM])
                user_email = payload.get("sub")
            except Exception:
                pass

        # Convert query to vector
        query_vector = embeddings.embed_query(request.question)

        # Similarity search
        results = index.query(
            vector=query_vector,
            top_k=3,
            include_metadata=True
        )

        # Extract context
        context = ""
        for match in results["matches"]:
            if "text" in match["metadata"]:
                context += match["metadata"]["text"] + "\n\n"

        if not context:
            answer_text = "I couldn't find any relevant information in the documents."
        else:
            # Prompt
            prompt = f"""
            Answer the question based ONLY on the following context from the borewell pumps knowledge base. 
            IMPORTANT: Provide the answer in plain text. Do NOT use double asterisks (**) or any markdown formatting for bolding.
            If the answer is not in the context, say that you don't know based on the provided documents.

            Context:
            {context}

            Question:
            {request.question}
            """

            # Invoke LLM
            response = llm.invoke(prompt)
            
            # Handle cases where response.content might be a list of blocks
            answer_text = response.content
            if isinstance(answer_text, list):
                answer_text = "".join([block.get("text", "") if isinstance(block, dict) else str(block) for block in answer_text])
        
        cleaned_answer = answer_text.replace("**", "").replace("*", "")

        # Save to history_collection
        history_doc = {
            "email": user_email or "anonymous",
            "question": request.question,
            "answer": cleaned_answer,
            "timestamp": datetime.utcnow().isoformat()
        }
        await history_collection.insert_one(history_doc)

        return {"answer": cleaned_answer}

    except Exception as e:
        print(f"Error in /chat: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/chat/history")
async def get_chat_history(authorization: Optional[str] = Header(None)):
    user_email = "anonymous"
    if authorization and authorization.startswith("Bearer "):
        try:
            jwt_token = authorization.split(" ")[1]
            payload = jwt.decode(jwt_token, SECRET_KEY, algorithms=[ALGORITHM])
            user_email = payload.get("sub")
        except Exception:
            pass
            
    try:
        cursor = history_collection.find({"email": user_email}).sort("timestamp", -1).limit(20)
        history = []
        async for doc in cursor:
            doc["id"] = str(doc["_id"])
            del doc["_id"]
            history.append(doc)
        return history
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Helper to check for admin role
async def get_current_admin(current_user: dict = Depends(get_current_user)):
    is_admin = current_user.get("is_admin", False) or current_user["email"] == "admin@chatbot.com" or current_user["email"].endswith("@admin.com")
    if not is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have administrative privileges."
        )
    return current_user

# Model for upload raw text
class DatasetTextUpload(BaseModel):
    title: str
    content: str

# 1. GET /admin/datasets -> list all datasets in MongoDB
@app.get("/admin/datasets")
async def get_datasets(current_admin: dict = Depends(get_current_admin)):
    try:
        cursor = datasets_collection.find()
        datasets = []
        async for doc in cursor:
            doc["id"] = str(doc["_id"])
            del doc["_id"]
            datasets.append(doc)
        return datasets
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# 2. POST /admin/upload-text -> embed raw text, insert into Pinecone & MongoDB
@app.post("/admin/upload-text")
async def upload_text(data: DatasetTextUpload, current_admin: dict = Depends(get_current_admin)):
    try:
        # Create a unique dataset ID
        dataset_id = str(ObjectId())
        
        # Split content into chunks
        splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=100)
        chunks = splitter.split_text(data.content)
        
        if not chunks:
            raise HTTPException(status_code=400, detail="Content is empty or too short.")
            
        # Create chunk IDs and embed
        chunk_ids = [f"doc_{dataset_id}_chunk_{i}" for i in range(len(chunks))]
        vectors = embeddings.embed_documents(chunks)
        
        # Upload to Pinecone
        metadatas = [{"text": chunk} for chunk in chunks]
        upsert_data = list(zip(chunk_ids, vectors, metadatas))
        index.upsert(vectors=upsert_data)
        
        # Save dataset metadata to MongoDB
        dataset_doc = {
            "_id": ObjectId(dataset_id),
            "title": data.title,
            "source_type": "text",
            "chunk_ids": chunk_ids,
            "char_count": len(data.content),
            "chunk_count": len(chunks),
            "created_at": datetime.utcnow().isoformat()
        }
        await datasets_collection.insert_one(dataset_doc)
        
        return {
            "id": dataset_id,
            "title": data.title,
            "status": "success",
            "chunks_count": len(chunks)
        }
    except Exception as e:
        print(f"Error in /admin/upload-text: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# 3. POST /admin/upload-file -> save file temp, split, embed, insert into Pinecone & MongoDB
@app.post("/admin/upload-file")
async def upload_file(
    file: UploadFile = File(...),
    current_admin: dict = Depends(get_current_admin)
):
    try:
        # Create unique dataset ID
        dataset_id = str(ObjectId())
        
        # Save file temporarily
        temp_dir = "data/temp"
        os.makedirs(temp_dir, exist_ok=True)
        temp_path = os.path.join(temp_dir, f"{dataset_id}_{file.filename}")
        
        with open(temp_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        try:
            # Load and parse text
            if file.filename.endswith(".pdf"):
                from langchain_community.document_loaders import PyPDFLoader
                loader = PyPDFLoader(temp_path)
                documents = loader.load()
            elif file.filename.endswith((".txt", ".md")):
                from langchain_community.document_loaders import TextLoader
                loader = TextLoader(temp_path, encoding="utf-8")
                documents = loader.load()
            else:
                raise HTTPException(status_code=400, detail="Unsupported file format. Please upload .pdf, .txt, or .md")
                
            if not documents:
                raise HTTPException(status_code=400, detail="Uploaded file is empty.")
                
            # Split
            splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=100)
            docs = splitter.split_documents(documents)
            
            if not docs:
                raise HTTPException(status_code=400, detail="No chunks generated from the file.")
                
            # Extract content & count
            chunks = [doc.page_content for doc in docs]
            total_chars = sum(len(chunk) for chunk in chunks)
            
            # Embed
            chunk_ids = [f"doc_{dataset_id}_chunk_{i}" for i in range(len(chunks))]
            vectors = embeddings.embed_documents(chunks)
            
            # Upsert to Pinecone
            metadatas = [{"text": chunk} for chunk in chunks]
            upsert_data = list(zip(chunk_ids, vectors, metadatas))
            index.upsert(vectors=upsert_data)
            
            # Save metadata to MongoDB
            dataset_doc = {
                "_id": ObjectId(dataset_id),
                "title": file.filename,
                "source_type": "file",
                "file_name": file.filename,
                "chunk_ids": chunk_ids,
                "char_count": total_chars,
                "chunk_count": len(chunks),
                "created_at": datetime.utcnow().isoformat()
            }
            await datasets_collection.insert_one(dataset_doc)
            
        finally:
            # Clean up temp file
            if os.path.exists(temp_path):
                os.remove(temp_path)
                
        return {
            "id": dataset_id,
            "title": file.filename,
            "status": "success",
            "chunks_count": len(chunks)
        }
    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"Error in /admin/upload-file: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# 4. DELETE /admin/datasets/{dataset_id} -> delete from Pinecone and MongoDB
@app.delete("/admin/datasets/{dataset_id}")
async def delete_dataset(dataset_id: str, current_admin: dict = Depends(get_current_admin)):
    try:
        # Find document
        doc = await datasets_collection.find_one({"_id": ObjectId(dataset_id)})
        if not doc:
            raise HTTPException(status_code=404, detail="Dataset not found.")
            
        chunk_ids = doc.get("chunk_ids", [])
        
        # Delete from Pinecone if we have chunk IDs
        if chunk_ids:
            try:
                index.delete(ids=chunk_ids)
            except Exception as pe:
                print(f"Error deleting from Pinecone (continuing delete flow): {pe}")
                
        # Delete from MongoDB
        await datasets_collection.delete_one({"_id": ObjectId(dataset_id)})
        
        return {"status": "success", "message": f"Dataset '{doc.get('title')}' deleted successfully."}
    except Exception as e:
        print(f"Error in /admin/delete-dataset: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/")
async def root():
    return {"message": "Borewell Pumps Chatbot API is running"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)