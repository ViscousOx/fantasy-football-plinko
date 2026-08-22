from fastapi import APIRouter, FastAPI

app = FastAPI()

api_router = APIRouter()
app.include_router(api_router, prefix="/api")


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}
