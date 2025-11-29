import requests
import os
import logging

logger = logging.getLogger(__name__)

def search_products(query, budget=None):
    """
    Searches for products using SerpApi (Google Shopping).
    """
    api_key = os.getenv("SERPAPI_API_KEY")
    if not api_key:
        logger.warning("SERPAPI_API_KEY not set. Returning mock data.")
        return [
            {
                "title": f"Mock Result for {query}",
                "price": "$45.00",
                "link": "#",
                "thumbnail": "https://via.placeholder.com/150",
                "source": "Mock"
            }
        ]

    params = {
        "engine": "google_shopping",
        "q": query,
        "api_key": api_key,
        "num": 5
    }
    
    if budget:
        # Simple filter string, though serpapi handles it differently usually
        # Better to filter results post-fetch or use specific syntax if supported
        logger.info(f"Budget filter requested: ${budget}")

    try:
        logger.info(f"Searching products with query: {query}")
        response = requests.get("https://serpapi.com/search", params=params, timeout=30)
        response.raise_for_status()  # Raise exception for bad status codes
        results = response.json()
        
        shopping_results = results.get("shopping_results", [])
        
        if not shopping_results:
            logger.warning(f"No shopping results found for query: {query}")
            return []
        
        # Parse to a cleaner format
        parsed_results = []
        for item in shopping_results:
            try:
                parsed_item = {
                    "title": item.get("title", "Unknown"),
                    "price": item.get("price", "N/A"),
                    "link": item.get("link", "#"),
                    "thumbnail": item.get("thumbnail", ""),
                    "source": item.get("source", "Unknown")
                }
                parsed_results.append(parsed_item)
            except Exception as item_error:
                logger.warning(f"Error parsing shopping result item: {item_error}")
                continue
            
        logger.info(f"Successfully parsed {len(parsed_results)} products")
        return parsed_results

    except requests.exceptions.RequestException as e:
        logger.error(f"Request error searching products: {e}", exc_info=True)
        return []
    except ValueError as e:
        logger.error(f"JSON parsing error in product search: {e}", exc_info=True)
        return []
    except Exception as e:
        logger.error(f"Unexpected error searching products: {e}", exc_info=True)
        return []


