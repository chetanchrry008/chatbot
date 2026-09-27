# pyrefly: ignore [missing-import]
import motor.motor_asyncio
import os
from dotenv import load_dotenv
import logging

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv()

MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
DATABASE_NAME = os.getenv("DATABASE_NAME", "chatbot")

try:
    client = motor.motor_asyncio.AsyncIOMotorClient(
        MONGODB_URL,
        serverSelectionTimeoutMS=5000
    )
    db = client["chatbot"]
    users_collection = db.get_collection("users")
    datasets_collection = db.get_collection("datasets")
    history_collection = db.get_collection("history")
    logger.info(f"Connected to MongoDB: {DATABASE_NAME}")
except Exception as e:
    logger.error(f"Failed to connect to MongoDB: {e}")
    raise e

async def init_db():
    """Initialize database indexes"""
    try:
        # Create a unique index on the email field
        await users_collection.create_index("email", unique=True)
        logger.info("Database indexes initialized successfully")
    except Exception as e:
        logger.error(f"Error initializing database indexes: {e}")
