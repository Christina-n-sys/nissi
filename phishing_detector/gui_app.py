"""Tkinter desktop front-end for the phishing URL detector."""

import tkinter as tk

from detector import score_url

BAND_COLOURS = {
    "HIGH": "red",
    "MEDIUM": "orange",
    "LOW": "green",
}


def check_url():
    result = score_url(entry.get())

    if result["rules"]:
        reasons = ", ".join(name for name, _ in result["rules"])
    else:
        reasons = "none"

    result_label.config(
        text=f"Score: {result['score']}%\n"
             f"Status: {result['label']}\n"
             f"Reasons: {reasons}",
        fg=BAND_COLOURS[result["band"]],
    )


# ---------- GUI ----------
root = tk.Tk()
root.title("Phishing URL Detector")
root.geometry("500x300")
root.configure(bg="#1e1e2f")  # dark background

# title
title = tk.Label(
    root,
    text="Phishing URL Detector",
    font=("Arial", 16, "bold"),
    bg="#1e1e2f",
    fg="white"
)
title.pack(pady=10)

# input label
label = tk.Label(
    root,
    text="Enter URL:",
    bg="#1e1e2f",
    fg="white"
)
label.pack()

# input box
entry = tk.Entry(
    root,
    width=50,
    font=("Arial", 10),
    bd=2,
    relief="flat"
)
entry.pack(pady=5)

# button
button = tk.Button(
    root,
    text="Check URL",
    command=check_url,
    bg="#4CAF50",
    fg="white",
    font=("Arial", 10, "bold"),
    padx=10,
    pady=5
)
button.pack(pady=10)

# result label
result_label = tk.Label(
    root,
    text="",
    bg="#1e1e2f",
    fg="white",
    wraplength=450,
    justify="left",
    font=("Arial", 10)
)
result_label.pack(pady=10)

# footer
footer = tk.Label(
    root,
    text="Multilingual Phishing Detection System",
    bg="#1e1e2f",
    fg="gray"
)
footer.pack(side="bottom", pady=5)

root.mainloop()
