"""Streamlit dashboard front-end for the phishing URL detector."""

import hashlib
import io

import pandas as pd
import streamlit as st

from detector import score_url

st.set_page_config(page_title="Cyber Security Dashboard", layout="wide")

st.title("Phishing Detection & File Hashing Dashboard")

menu = st.sidebar.selectbox("Select Feature", ["URL Detection", "File Hashing"])

BAND_RENDERERS = {
    "HIGH": st.error,
    "MEDIUM": st.warning,
    "LOW": st.success,
}


def calculate_hash(file, algorithm="sha256"):
    if algorithm == "md5":
        hash_func = hashlib.md5()
    elif algorithm == "sha1":
        hash_func = hashlib.sha1()
    else:
        hash_func = hashlib.sha256()

    for chunk in iter(lambda: file.read(4096), b""):
        hash_func.update(chunk)

    return hash_func.hexdigest()


if menu == "URL Detection":
    st.subheader("Rule-Based Multilingual URL Phishing Detection")

    url = st.text_input("Enter URL")

    if st.button("Analyze URL"):
        if url.strip():
            result = score_url(url)

            BAND_RENDERERS[result["band"]](
                f"{result['label']} — score {result['score']}%"
            )
            st.progress(result["score"] / 100)

            if result["rules"]:
                st.subheader("Why this score?")
                st.table(
                    pd.DataFrame(result["rules"], columns=["Rule", "Weight"])
                )
            else:
                st.info("No suspicious indicators found.")
        else:
            st.warning("Please enter a URL")


elif menu == "File Hashing":
    st.subheader("File Hashing Tool")

    uploaded_file = st.file_uploader("Upload a file")

    algo = st.selectbox("Select Hash Algorithm", ["md5", "sha1", "sha256"])

    if uploaded_file is not None:
        if st.button("Generate Hash"):
            file_bytes = uploaded_file.read()

            file_obj = io.BytesIO(file_bytes)
            hash_value = calculate_hash(file_obj, algo)

            st.code(hash_value)
            st.success(f"{algo.upper()} Hash Generated Successfully!")

    st.subheader("Compare Hash")

    original_hash = st.text_input("Enter Original Hash")
    generated_hash = st.text_input("Enter Generated Hash")

    if st.button("Compare Hash"):
        if original_hash and generated_hash:
            if original_hash.strip().lower() == generated_hash.strip().lower():
                st.success("Hash Match (File Safe)")
            else:
                st.error("Hash Mismatch (File Tampered)")
        else:
            st.warning("Enter both hash values")
