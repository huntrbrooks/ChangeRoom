import requests
import os

def search_products(query, budget=None):
    """
    Searches for products using SerpApi (Google Shopping).
    """
    api_key = os.getenv("SERPAPI_API_KEY")
    if not api_key:
        print("Warning: SERPAPI_API_KEY not set.")
        return [
            {
                "title": f"Mock Result for {query}",
                "price": "$45.00",
                "link": "#",
                "thumbnail": "https://via.placeholder.com/150"
            }
        ]

    params = {
        "engine": "google_shopping",
        "q": query,
        "api_key": api_key,
        "num": 5
    }
    
    if budget:
        # simple filter string, though serpapi handles it differently usually
        # Better to filter results post-fetch or use specific syntax if supported
        pass

    try:
        response = requests.get("https://serpapi.com/search", params=params)
        results = response.json()
        
        shopping_results = results.get("shopping_results", [])
        
        # Parse to a cleaner format
        parsed_results = []
        for item in shopping_results:
            price_raw = item.get("price", "$0")
            # Basic budget filtering (very rough)
            parsed_results.append({
                "title": item.get("title"),
                "price": item.get("price"),
                "link": item.get("link"),
                "thumbnail": item.get("thumbnail"),
                "source": item.get("source")
            })
            
        return parsed_results

    except Exception as e:
        print(f"Error searching products: {e}")
        return []

