import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from klipin.config import settings
from klipin.routers import auth, health, jobs, payments

# Force INFO logging untuk semua module klipin.* (uvicorn default cuma WARNING
# untuk app loggers, jadi info tentang cookies/pipeline progress kena filter).
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    force=True,
)
logging.getLogger("klipin").setLevel(logging.INFO)

app = FastAPI(title="Klipin API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(jobs.router)
app.include_router(jobs.clips_router)
app.include_router(payments.router)
