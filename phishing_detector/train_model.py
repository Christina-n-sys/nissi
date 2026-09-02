import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
import pickle

# -------------------------------
# DATASET
# -------------------------------
data = {
    "url": [
        "http://secure-login.com",
        "https://bank-update.com",
        "http://verify-account.net",
        "https://update-payment-info.com",
        "https://google.com",
        "https://github.com",
        "https://amazon.in",
        "https://stackoverflow.com"
    ],
    "label": [1, 1, 1, 1, 0, 0, 0, 0]
}

df = pd.DataFrame(data)


vectorizer = TfidfVectorizer()
X = vectorizer.fit_transform(df["url"])


model = LogisticRegression()
model.fit(X, df["label"])


pickle.dump(model, open("phishing_model.pkl", "wb"))
pickle.dump(vectorizer, open("vectorizer.pkl", "wb"))

print("✅ Files created successfully!")