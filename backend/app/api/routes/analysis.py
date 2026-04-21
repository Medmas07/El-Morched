import uuid
from fastapi import APIRouter, Depends, BackgroundTasks, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.schemas.analysis import AnalysisRequest, AnalysisResult, AnalysisStatus
from app.fusion.pipeline import AnalysisPipeline
from app.models.analysis import AnalysisRun, AnalysisStatus as DBStatus

router = APIRouter(prefix="/analysis", tags=["analysis"])

# In-memory cache for hackathon; replace with Redis/DB polling in prod
_results: dict[str, AnalysisResult] = {}


@router.post("/run", response_model=AnalysisStatus)
async def run_analysis(
    request: AnalysisRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    run_id = uuid.uuid4()

    # Persist run record
    run = AnalysisRun(
        id=run_id,
        status=DBStatus.pending,
        simulation_engine=request.simulation_engine or "default",
        config_snapshot=request.model_dump(mode="json"),
    )
    db.add(run)
    await db.commit()

    background_tasks.add_task(_execute_pipeline, run_id, request, db)

    from datetime import datetime
    return AnalysisStatus(run_id=run_id, status="pending", created_at=datetime.utcnow())


@router.get("/{run_id}", response_model=AnalysisResult | AnalysisStatus)
async def get_analysis(run_id: uuid.UUID):
    key = str(run_id)
    if key in _results:
        return _results[key]

    from datetime import datetime
    return AnalysisStatus(run_id=run_id, status="running", created_at=datetime.utcnow())


async def _execute_pipeline(run_id: uuid.UUID, request: AnalysisRequest, db: AsyncSession):
    try:
        pipeline = AnalysisPipeline(engine_override=request.simulation_engine)
        result = await pipeline.run(request, run_id)
        _results[str(run_id)] = result
    except Exception as e:
        _results[str(run_id)] = AnalysisResult(
            run_id=run_id, status=f"failed: {e}", flood_layers=[], heat_layers=[]
        )
