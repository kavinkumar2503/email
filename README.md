# Email Spam Checker (Local Run)

This project includes a static frontend (`index.html`, `css/`, `js/`, `images/`) and an optional Flask backend (`app.py`). The frontend works fully offline using a simple keyword check, so the easiest way to run it is with a static server.

## Option A: Run as static site (recommended)

- Requires only Python 3 (already configured in a local virtual environment).
- Serves `index.html`, `css`, `js`, and `images` directly.

Steps:

1. Open a terminal in this folder.
2. Start a simple HTTP server:

   PowerShell:
   ```powershell
   & ".\.venv\Scripts\python.exe" -m http.server 8000
   ```

3. Open your browser to:

   http://localhost:8000/

## Option B: Run Flask backend (optional)

The Flask app in `app.py` exposes a `/check_spam` endpoint using a quick demo model. The current frontend (`js/script.js`) performs checks locally and does not call the backend; to use the backend you would update the JS to POST to `/check_spam`.

Steps:

1. Install dependencies into the local venv:
   ```powershell
   & ".\.venv\Scripts\python.exe" -m pip install --upgrade pip
   & ".\.venv\Scripts\python.exe" -m pip install flask scikit-learn
   ```

2. Run the Flask app:
   ```powershell
   & ".\.venv\Scripts\python.exe" app.py
   ```

3. In your browser, go to:

   http://127.0.0.1:5000/

## Notes
- Dark mode toggle is built in.
- If you add backend integration, ensure CORS/paths align and switch the JS to fetch `/check_spam`.
