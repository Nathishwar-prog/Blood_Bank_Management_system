import sys
import os

# Add parent directory of 'scripts' (i.e., 'backend') to path to allow importing 'app'
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(backend_dir)

try:
    from app.database import engine, Base
    from app.models.user import User
    from app.models.blood_bank import BloodBank
except ImportError as e:
    print(f"Error importing modules: {e}")
    print(f"Current sys.path: {sys.path}")
    print(f"Looking for 'app' in: {backend_dir}")
    raise e

from sqlalchemy import text

# Create tables
def init_db():
    print("Creating tables...")
    with engine.connect() as connection:
        try:
            print("Enabling PostGIS extension...")
            connection.execute(text("CREATE EXTENSION IF NOT EXISTS postgis"))
            connection.commit()
        except Exception as e:
            print(f"Warning: Could not enable PostGIS: {e}")
            
    Base.metadata.create_all(bind=engine)
    print("Tables created successfully!")

if __name__ == "__main__":
    init_db()
