import io
import mimetypes
import os
import uuid
import zipfile

from flask import Flask, abort, jsonify, render_template, request, send_file
from werkzeug.utils import secure_filename

from models import MediaItem, Folder, db

app = Flask(__name__)
app.config["SECRET_KEY"] = "influence-change-in-production"
app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///influence.db"
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
app.config["UPLOAD_FOLDER"] = os.path.join(os.path.dirname(__file__), "uploads")
app.config["MAX_CONTENT_LENGTH"] = 500 * 1024 * 1024  # 500 MB

ALLOWED_EXTENSIONS = {
    "jpg", "jpeg", "png", "gif", "webp", "heic", "bmp", "tiff",
    "mp4", "mov", "avi", "webm", "mkv", "m4v",
}

IMAGE_EXTENSIONS = {"jpg", "jpeg", "png", "gif", "webp", "heic", "bmp", "tiff"}
VIDEO_EXTENSIONS = {"mp4", "mov", "avi", "webm", "mkv", "m4v"}

db.init_app(app)

with app.app_context():
    db.create_all()
    os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)


def detect_media_type(filename: str, requested: str = "") -> str:
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    valid_types = {"photo", "video", "slideshow", "reel"}
    if requested in valid_types:
        return requested
    if ext in VIDEO_EXTENSIONS:
        return "video"
    return "photo"


# ──────────────────────────────────────────────
# Page routes
# ──────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/album")
def album():
    return render_template("album.html")


# ──────────────────────────────────────────────
# Folder API
# ──────────────────────────────────────────────

@app.route("/api/folders", methods=["GET"])
def get_folders():
    folders = Folder.query.order_by(Folder.created_at.asc()).all()
    return jsonify([f.to_dict() for f in folders])


@app.route("/api/folders", methods=["POST"])
def create_folder():
    data = request.get_json() or {}
    name = data.get("name", "").strip()
    if not name:
        return jsonify({"error": "Folder name is required"}), 400
    folder = Folder(name=name)
    db.session.add(folder)
    db.session.commit()
    return jsonify(folder.to_dict()), 201


@app.route("/api/folders/<int:folder_id>", methods=["PUT"])
def rename_folder(folder_id):
    folder = db.get_or_404(Folder, folder_id)
    data = request.get_json() or {}
    name = data.get("name", "").strip()
    if not name:
        return jsonify({"error": "Folder name is required"}), 400
    folder.name = name
    db.session.commit()
    return jsonify(folder.to_dict())


@app.route("/api/folders/<int:folder_id>", methods=["DELETE"])
def delete_folder(folder_id):
    folder = db.get_or_404(Folder, folder_id)
    for item in folder.items:
        path = os.path.join(app.config["UPLOAD_FOLDER"], item.filename)
        if os.path.exists(path):
            os.remove(path)
    db.session.delete(folder)
    db.session.commit()
    return jsonify({"message": "Folder deleted"})


@app.route("/api/folders/<int:folder_id>/download")
def download_folder(folder_id):
    folder = db.get_or_404(Folder, folder_id)
    if not folder.items:
        return jsonify({"error": "Folder is empty"}), 400

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for item in folder.items:
            path = os.path.join(app.config["UPLOAD_FOLDER"], item.filename)
            if os.path.exists(path):
                zf.write(path, item.original_name)
    buf.seek(0)
    return send_file(
        buf,
        mimetype="application/zip",
        as_attachment=True,
        download_name=f"{folder.name}.zip",
    )


# ──────────────────────────────────────────────
# Media API
# ──────────────────────────────────────────────

@app.route("/api/media", methods=["GET"])
def get_media():
    folder_id_param = request.args.get("folder_id")
    media_type = request.args.get("type", "all")

    query = MediaItem.query
    if folder_id_param is not None:
        query = query.filter(MediaItem.folder_id == int(folder_id_param))
    if media_type and media_type != "all":
        query = query.filter(MediaItem.media_type == media_type)

    items = query.order_by(MediaItem.created_at.desc()).all()
    return jsonify([i.to_dict() for i in items])


@app.route("/api/media/upload", methods=["POST"])
def upload_media():
    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400

    file = request.files["file"]
    if not file.filename:
        return jsonify({"error": "No file selected"}), 400

    original_name = secure_filename(file.filename)
    ext = original_name.rsplit(".", 1)[-1].lower() if "." in original_name else ""

    if ext not in ALLOWED_EXTENSIONS:
        return jsonify({"error": f"File type .{ext} is not allowed"}), 400

    unique_name = f"{uuid.uuid4().hex}.{ext}"
    dest = os.path.join(app.config["UPLOAD_FOLDER"], unique_name)
    file.save(dest)

    file_size = os.path.getsize(dest)
    mime = mimetypes.guess_type(original_name)[0] or "application/octet-stream"

    requested_type = request.form.get("media_type", "")
    media_type = detect_media_type(original_name, requested_type)

    folder_id = request.form.get("folder_id") or None
    if folder_id is not None:
        folder_id = int(folder_id)
        if not db.session.get(Folder, folder_id):
            os.remove(dest)
            return jsonify({"error": "Folder not found"}), 404

    display_name = request.form.get("name", original_name)

    item = MediaItem(
        name=display_name,
        filename=unique_name,
        original_name=original_name,
        media_type=media_type,
        folder_id=folder_id,
        file_size=file_size,
        mime_type=mime,
    )
    db.session.add(item)
    db.session.commit()
    return jsonify(item.to_dict()), 201


@app.route("/api/media/<int:media_id>", methods=["DELETE"])
def delete_media(media_id):
    item = db.get_or_404(MediaItem, media_id)
    path = os.path.join(app.config["UPLOAD_FOLDER"], item.filename)
    if os.path.exists(path):
        os.remove(path)
    db.session.delete(item)
    db.session.commit()
    return jsonify({"message": "Deleted"})


@app.route("/api/media/<int:media_id>/download")
def download_media(media_id):
    item = db.get_or_404(MediaItem, media_id)
    path = os.path.join(app.config["UPLOAD_FOLDER"], item.filename)
    if not os.path.exists(path):
        abort(404)
    return send_file(path, as_attachment=True, download_name=item.original_name)


@app.route("/api/media/<int:media_id>/file")
def serve_media(media_id):
    item = db.get_or_404(MediaItem, media_id)
    path = os.path.join(app.config["UPLOAD_FOLDER"], item.filename)
    if not os.path.exists(path):
        abort(404)
    return send_file(path, mimetype=item.mime_type)


@app.route("/api/media/<int:media_id>/move", methods=["PUT"])
def move_media(media_id):
    item = db.get_or_404(MediaItem, media_id)
    data = request.get_json() or {}
    folder_id = data.get("folder_id")

    if folder_id is not None:
        if not db.session.get(Folder, folder_id):
            return jsonify({"error": "Folder not found"}), 404

    item.folder_id = folder_id
    db.session.commit()
    return jsonify(item.to_dict())


if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)
