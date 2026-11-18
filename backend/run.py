"""Start the Stock Manager API server.

Usage:
    python run.py            # http://localhost:8000
    python run.py --no-reload
"""

import sys

import uvicorn

if __name__ == "__main__":
    reload = "--no-reload" not in sys.argv
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=reload)
