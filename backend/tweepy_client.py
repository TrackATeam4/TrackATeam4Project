import tweepy
from dotenv import load_dotenv
import os

load_dotenv()

CONSUMER_KEY=os.getenv("CONSUMER_KEY")
CONSUMER_SECRET=os.getenv("SECRET_KEY")
ACCESS_TOKEN=os.getenv("CLIENT_ID")
ACCESS_TOKEN_SECRET=os.getenv("CLIENT_SECRET")
X_BEARER_TOKEN=os.getenv("X_BEARER_TOKEN")

if not CONSUMER_KEY or not CONSUMER_SECRET or not ACCESS_TOKEN or not ACCESS_TOKEN_SECRET:
    raise ValueError("Missing X API credentials. Please check your .env file.")

twitter = tweepy.Client(
    consumer_key=CONSUMER_KEY,
    consumer_secret=CONSUMER_SECRET,
    access_token=ACCESS_TOKEN,
    access_token_secret=ACCESS_TOKEN_SECRET,
    # bearer_token=X_BEARER_TOKEN,
)

def get_x_client() -> tweepy.Client:
    print("Creating X client with provided credentials...")
    return twitter

