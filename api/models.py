from datetime import date
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field

class Strict(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)

class Area(Strict):
    title: str = Field(min_length=1, max_length=120)
    goal: str = Field(min_length=1, max_length=2000)
    theme: Literal['forest', 'clay', 'blue'] = 'forest'

class Task(Strict):
    title: str = Field(min_length=1, max_length=120)
    area_id: str = Field(min_length=1, max_length=36)
    due: date | Literal[''] = ''
    done: bool = False

class Memory(Strict):
    title: str = Field(min_length=1, max_length=120)
    content: str = Field(min_length=1, max_length=4000)
    area_id: str = Field(default='', max_length=36)

class Draft(Strict):
    title: str = Field(min_length=1, max_length=120)
    area_id: str = Field(min_length=1, max_length=36)
    content: str = Field(min_length=1, max_length=20000)
    status: Literal['draft','reviewed'] = 'draft'
    source_job: str = Field(max_length=12000)
    model: str = Field(max_length=100)

class Write(Strict):
    kind: Literal['area','task','memory','draft']
    data: dict
    version: int | None = Field(default=None, ge=1)

class Chat(Strict):
    message: str = Field(min_length=1, max_length=4000)
    area_id: str | None = Field(default=None, max_length=36)
    conversation_id: str | None = Field(default=None, max_length=36)

class DraftRequest(Strict):
    area_id: str = Field(min_length=1, max_length=36)
    job: str = Field(min_length=20, max_length=12000)

MODELS = {'area': Area, 'task': Task, 'memory': Memory, 'draft': Draft}
