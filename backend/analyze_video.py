import os
import sys
import json
import time
import subprocess
import dotenv
from google import genai
import imageio_ffmpeg

# Change working directory to the script's directory
os.chdir(os.path.dirname(os.path.abspath(__file__)))

# Load environment variables
dotenv.load_dotenv()

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    print("Error: GEMINI_API_KEY not found in environment.")
    sys.exit(1)

# Initialize the new genai client
client = genai.Client(api_key=GEMINI_API_KEY)

output_dir = "./public/screenshots"
json_output_path = "./video_chunks.json"

# Rename video file if it has accents to avoid ascii encoding issues during upload
original_video_path = "../présentation-de-soft-transit-web.mp4"
video_path = "../presentation-de-soft-transit-web.mp4"

if os.path.exists(original_video_path):
    print(f"Renaming {original_video_path} to {video_path} to avoid upload encoding issues...")
    try:
        if os.path.exists(video_path):
            os.remove(video_path)
        os.rename(original_video_path, video_path)
    except Exception as e:
        print(f"Warning: could not rename: {e}")
        video_path = original_video_path

if not os.path.exists(video_path):
    print(f"Error: Video file not found at {video_path}")
    sys.exit(1)

if not os.path.exists(output_dir):
    os.makedirs(output_dir)

# Check if video_chunks.json already exists and is non-empty
chunks = []
if os.path.exists(json_output_path) and os.path.getsize(json_output_path) > 0:
    print(f"Found existing analysis at {json_output_path}. Skipping Gemini upload and analysis.")
    try:
        with open(json_output_path, "r", encoding="utf-8") as f:
            chunks = json.load(f)
        print(f"Successfully loaded {len(chunks)} chunks from cache.")
    except Exception as e:
        print(f"Error loading cache, will re-analyze: {e}")
        chunks = []

if not chunks:
    # Upload the video to Gemini
    print("Uploading video to Gemini File API...")
    try:
        # Use client.files.upload to upload
        video_file = client.files.upload(file=video_path)
        print(f"Video uploaded successfully. Name: {video_file.name}")
    except Exception as e:
        print(f"Error uploading video: {e}")
        sys.exit(1)

    # Wait for video processing
    print("Waiting for video to be processed by Gemini...")
    while True:
        try:
            file_info = client.files.get(name=video_file.name)
            if file_info.state == "ACTIVE":
                print("Video processing complete. State is ACTIVE.")
                break
            elif file_info.state == "FAILED":
                print(f"Video processing failed.")
                sys.exit(1)
            else:
                print(f"Current state: {file_info.state}. Waiting 15 seconds...")
                time.sleep(15)
        except Exception as e:
            print(f"Error checking file status: {e}. Waiting 15 seconds...")
            time.sleep(15)

    # Prompt Gemini for detailed chapters and analysis
    print("Analyzing video content with Gemini...")
    prompt = """
Analyze this video which is a user guide/demo of the application "Soft Transit Web" (a software for customs and transit management).
The video is about 1 hour long.
You must extract the key moments (chapters) of the video. Identify when the screen changes significantly, when a new module or feature is presented, or when a new step in the workflow is explained. Aim for approximately 25 to 40 distinct chunks/moments to cover the video thoroughly.

For each key moment, you must return:
1. `timestamp_seconds`: The exact time (in seconds) where the feature/screen is clearly visible and fully displayed. This will be used to extract a screenshot.
2. `time_string`: The time in "HH:MM:SS" format.
3. `title`: A concise French title of the chapter/section/feature (e.g. "Connexion à l'application", "Configuration d'un déclarant", "Création d'un dossier de transit", "Saisie des débours douane").
4. `description`: A detailed French description of what is displayed on the screen (labels, input fields, buttons, tables, modules). Be very descriptive.
5. `instructions`: A detailed step-by-step French explanation of how to use this feature as demonstrated in the video. Incorporate the explanations given in the audio guide.

Respond strictly in JSON format. The response must be a JSON array of objects, where each object has the keys: `timestamp_seconds`, `time_string`, `title`, `description`, `instructions`.
Do not wrap the JSON in markdown code blocks like ```json ... ```, or if you do, ensure it is valid JSON that can be parsed.
"""

    try:
        # Use client.models.generate_content for the new SDK
        response = client.models.generate_content(
            model="gemini-3.5-flash",
            contents=[video_file, prompt],
            config={"response_mime_type": "application/json"}
        )
        
        # Parse and save the result
        analysis_text = response.text
        # Clean up markdown code blocks if any
        if analysis_text.startswith("```"):
            lines = analysis_text.split("\n")
            if lines[0].startswith("```json"):
                analysis_text = "\n".join(lines[1:-1])
            elif lines[0].startswith("```"):
                analysis_text = "\n".join(lines[1:-1])
                
        chunks = json.loads(analysis_text)
        print(f"Successfully extracted {len(chunks)} video chunks.")
        
        # Save the json file
        with open(json_output_path, "w", encoding="utf-8") as f:
            json.dump(chunks, f, ensure_ascii=False, indent=2)
        print(f"Saved analysis to {json_output_path}")

    except Exception as e:
        print(f"Error during Gemini analysis: {e}")
        # Cleanup uploaded file before exit
        try:
            client.files.delete(name=video_file.name)
            print("Cleaned up uploaded file from Gemini.")
        except:
            pass
        sys.exit(1)

    # Delete the uploaded file as it's no longer needed
    try:
        client.files.delete(name=video_file.name)
        print("Cleaned up uploaded file from Gemini.")
    except Exception as e:
        print(f"Warning: Could not delete uploaded file: {e}")

# Extract screenshots using FFmpeg
ffmpeg_path = imageio_ffmpeg.get_ffmpeg_exe()
print(f"Using FFmpeg at: {ffmpeg_path}")

print("Extracting screenshots for each chunk...")
for idx, chunk in enumerate(chunks):
    ts = chunk.get("timestamp_seconds")
    if ts is None:
        continue
    
    output_filename = f"video_frame_{ts}.png"
    output_filepath = os.path.join(output_dir, output_filename)
    
    print(f"[{idx+1}/{len(chunks)}] Extracting frame at {chunk.get('time_string')} ({ts}s)...")
    
    # Command to extract frame: seek fast (-ss before -i), get 1 frame (-vframes 1)
    cmd = [
        ffmpeg_path,
        "-y",               # Overwrite output files
        "-ss", str(ts),     # Seek to timestamp
        "-i", video_path,   # Input file
        "-vframes", "1",    # Output 1 frame
        "-q:v", "2",        # High quality
        output_filepath
    ]
    
    try:
        # Run ffmpeg silently
        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
        print(f"  [OK] Saved to {output_filepath}")
    except Exception as e:
        print(f"  [ERROR] Error extracting frame: {e}")

print("Video analysis and screenshot extraction completed successfully.")
