"""
Helper script to get OAuth2 refresh token for Google GenAI API.
Run this once to get a refresh token, then set it as GOOGLE_REFRESH_TOKEN environment variable.

Usage:
    python get_oauth2_token.py
"""

import os
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
import json

# OAuth2 scopes for Generative AI
SCOPES = [
    'https://www.googleapis.com/auth/generative-language',
    'https://www.googleapis.com/auth/cloud-platform'
]

def get_refresh_token():
    """Get OAuth2 refresh token using client ID and secret."""
    client_id = os.getenv("GOOGLE_CLIENT_ID")
    client_secret = os.getenv("GOOGLE_CLIENT_SECRET")
    
    if not client_id or not client_secret:
        print("Error: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in environment variables")
        return
    
    # Create OAuth2 flow configuration
    client_config = {
        "installed": {
            "client_id": client_id,
            "client_secret": client_secret,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
            "redirect_uris": ["http://localhost"]
        }
    }
    
    # Create flow
    flow = InstalledAppFlow.from_client_config(client_config, SCOPES)
    
    # Run the OAuth2 flow
    print("Starting OAuth2 flow...")
    print("A browser window will open. Please authorize the application.")
    credentials = flow.run_local_server(port=0)
    
    # Get refresh token
    refresh_token = credentials.refresh_token
    
    if refresh_token:
        print("\n" + "="*60)
        print("SUCCESS! Your refresh token is:")
        print("="*60)
        print(refresh_token)
        print("="*60)
        print("\nAdd this to your .env file or environment variables as:")
        print(f"GOOGLE_REFRESH_TOKEN={refresh_token}")
        print("\nOr set it in your deployment environment (Render, etc.)")
    else:
        print("Warning: No refresh token received. You may need to re-run this script.")

if __name__ == "__main__":
    get_refresh_token()

