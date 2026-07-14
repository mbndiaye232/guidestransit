import os
import sys
import fitz  # PyMuPDF

def main():
    pdf_path = "../SOFT_TRANSIT_WEB_GUIDE_UTILISATION.pdf"
    output_dir = "./public/screenshots"

    if not os.path.exists(pdf_path):
        print(f"Error: PDF file not found at {pdf_path}")
        sys.exit(1)

    if not os.path.exists(output_dir):
        os.makedirs(output_dir)

    print(f"Opening PDF: {pdf_path}")
    doc = fitz.open(pdf_path)
    print(f"Total pages: {len(doc)}")

    print("Converting pages to PNGs...")
    for page_idx in range(len(doc)):
        page_num = page_idx + 1
        page = doc.load_page(page_idx)
        # render page to an image (pixmap) with 150 DPI
        pix = page.get_pixmap(dpi=150)
        output_path = os.path.join(output_dir, f"page_{page_num}.png")
        pix.save(output_path)
        print(f"Saved: page_{page_num}.png")

    print("Successfully converted all PDF pages to images.")

if __name__ == "__main__":
    main()
