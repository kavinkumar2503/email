from flask import Flask, request, jsonify, send_file
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
import os
import csv
import json

app = Flask(__name__, static_url_path='', static_folder='.')

DATA_PATH = os.path.join(os.path.dirname(__file__), 'EmailCollection')

def _try_load_from_directory(path):
    texts, y = [], []
    if not os.path.isdir(path):
        return None
    # Prefer subfolders spam/ham
    spam_dir = os.path.join(path, 'spam')
    ham_dir = os.path.join(path, 'ham')
    if os.path.isdir(spam_dir) or os.path.isdir(ham_dir):
        for label_dir, label in [(spam_dir, 1), (ham_dir, 0)]:
            if not os.path.isdir(label_dir):
                continue
            for root, _, files in os.walk(label_dir):
                for f in files:
                    if f.lower().endswith(('.txt', '.eml')):
                        try:
                            with open(os.path.join(root, f), 'r', encoding='utf-8', errors='ignore') as fh:
                                texts.append(fh.read())
                                y.append(label)
                        except Exception:
                            continue
        return (texts, y) if texts else None
    # Otherwise, read .txt files in root, infer by filename
    for f in os.listdir(path):
        p = os.path.join(path, f)
        if os.path.isfile(p) and f.lower().endswith('.txt'):
            label = 1 if 'spam' in f.lower() else 0 if 'ham' in f.lower() else None
            if label is None:
                continue
            try:
                with open(p, 'r', encoding='utf-8', errors='ignore') as fh:
                    texts.append(fh.read())
                    y.append(label)
            except Exception:
                continue
    return (texts, y) if texts else None

def _try_load_from_file(path):
    if not os.path.isfile(path):
        return None
    texts, y = [], []
    # Try CSV first
    try:
        with open(path, 'r', encoding='utf-8', errors='ignore') as fh:
            sample = fh.read(2048)
            fh.seek(0)
            try:
                dialect = csv.Sniffer().sniff(sample)
            except Exception:
                dialect = csv.get_dialect('excel')
            reader = csv.DictReader(fh, dialect=dialect)
            cols = [c.lower() for c in reader.fieldnames] if reader.fieldnames else []
            # Accept label/category/is_spam and text/body/message
            for row in reader:
                row_l = {k.lower(): v for k, v in row.items()}
                text = row_l.get('text') or row_l.get('body') or row_l.get('message')
                label_raw = row_l.get('label') or row_l.get('category') or row_l.get('is_spam')
                if text is None or label_raw is None:
                    continue
                label = 1 if str(label_raw).strip().lower() in ('1', 'spam', 'true', 'yes') else 0
                texts.append(text)
                y.append(label)
        if texts:
            return texts, y
    except Exception:
        pass
    # Try JSON lines
    try:
        with open(path, 'r', encoding='utf-8', errors='ignore') as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                obj = json.loads(line)
                text = obj.get('text') or obj.get('body') or obj.get('message')
                label_raw = obj.get('label') or obj.get('category') or obj.get('is_spam')
                if text is None or label_raw is None:
                    continue
                label = 1 if str(label_raw).strip().lower() in ('1', 'spam', 'true', 'yes') else 0
                texts.append(text)
                y.append(label)
        if texts:
            return texts, y
    except Exception:
        pass
    # Try TSV-like: label\ttext
    try:
        with open(path, 'r', encoding='utf-8', errors='ignore') as fh:
            for line in fh:
                if not line.strip():
                    continue
                parts = line.split('\t', 1)
                if len(parts) == 2:
                    label_raw, text = parts
                    label = 1 if label_raw.strip().lower() in ('1', 'spam', 'true', 'yes') else 0
                    texts.append(text)
                    y.append(label)
        if texts:
            return texts, y
    except Exception:
        pass
    return None

def load_dataset(path: str):
    # Try directory, then file
    data = _try_load_from_directory(path)
    if data:
        return data
    data = _try_load_from_file(path)
    if data:
        return data
    return None

# Train model
def train_model():
    dataset = load_dataset(DATA_PATH)
    if dataset is None:
        # Fallback sample data (used only when EmailCollection is missing/unreadable)
        # Balanced mix of common spam/ham patterns for a better demo model.
        emails = [
            # Spam
            'Win a free iPhone now',
            'Congratulations, you have won a lottery',
            'Cheap meds available',
            'Get rich quick scheme',
            'Claim your prize now, limited time offer',
            'Urgent: your account has been suspended, click here to verify',
            'You have won $1,000,000, reply with your bank details',
            'Exclusive deal: 90% discount only today',
            'Risk free investment guaranteed returns',
            'Act fast: verify your credit to receive loan approval',
            # Ham
            'Meeting at 10am tomorrow',
            'Your invoice is attached',
            'Let’s catch up for lunch',
            'Project update attached',
            'Weekly status report for sprint',
            'Reminder: team call rescheduled to 3pm',
            'Shipping update: your order has been dispatched',
            'Calendar invite: design review on Friday',
            'Minutes of meeting and next steps',
            'Thanks for your help on the presentation',
        ]
        labels = [
            1, 1, 1, 1, 1, 1, 1, 1, 1, 1,  # first 10 are spam
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0   # next 10 are ham
        ]
        texts, y = emails, labels
    else:
        texts, y = dataset

    pipe = Pipeline([
        ('tfidf', TfidfVectorizer(
            lowercase=True,
            stop_words='english',
            ngram_range=(1, 2),
            min_df=1,
            max_df=0.98,
        )),
        ('clf', LogisticRegression(max_iter=1000))
    ])
    pipe.fit(texts, y)
    return pipe

model = train_model()

@app.route('/')
def home():
    return app.send_static_file('index.html')

@app.route('/check_spam', methods=['POST'])
def check_spam():
    data = request.get_json()
    email_text = data.get('email', '')
    if not email_text:
        return jsonify({'result': 'Not Spam', 'probability': 0.0, 'found_keywords': []})
    prob = float(model.predict_proba([email_text])[0][1]) if hasattr(model, 'predict_proba') else float(model.decision_function([email_text])[0])
    prediction = 1 if prob >= 0.5 else 0
    result = 'Spam' if prediction == 1 else 'Not Spam'

    # Extract matched indicative tokens (approximate):
    found = []
    try:
        vec = model.named_steps.get('tfidf')
        if vec is not None:
            vocab = set()
            text_low = email_text.lower()
            for tok in vec.get_feature_names_out()[:5000]:  # limit for perf
                if tok in text_low:
                    vocab.add(tok)
            found = sorted(list(vocab))[:20]
    except Exception:
        found = []

    return jsonify({'result': result, 'probability': prob, 'found_keywords': found})

@app.route('/reload_model', methods=['POST'])
def reload_model():
    global model
    model = train_model()
    return jsonify({'status': 'ok'})

if __name__ == '__main__':
    app.run(debug=True)
