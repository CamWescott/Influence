from flask_sqlalchemy import SQLAlchemy
from datetime import datetime

db = SQLAlchemy()


class Folder(db.Model):
    __tablename__ = "folders"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    items = db.relationship(
        "MediaItem",
        backref="folder",
        lazy=True,
        cascade="all, delete-orphan",
    )

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "created_at": self.created_at.isoformat(),
            "item_count": len(self.items),
        }


class MediaItem(db.Model):
    __tablename__ = "media_items"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    filename = db.Column(db.String(200), nullable=False, unique=True)
    original_name = db.Column(db.String(200), nullable=False)
    media_type = db.Column(db.String(20), nullable=False)  # photo, video, slideshow, reel
    folder_id = db.Column(db.Integer, db.ForeignKey("folders.id"), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    file_size = db.Column(db.Integer, default=0)
    mime_type = db.Column(db.String(100), default="")

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "filename": self.filename,
            "original_name": self.original_name,
            "media_type": self.media_type,
            "folder_id": self.folder_id,
            "created_at": self.created_at.isoformat(),
            "file_size": self.file_size,
            "mime_type": self.mime_type,
            "url": f"/api/media/{self.id}/file",
        }
