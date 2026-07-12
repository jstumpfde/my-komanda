from fastapi import FastAPI
from pydantic import BaseModel
from natasha import Segmenter, NewsEmbedding, NewsMorphTagger, NewsNERTagger, Doc

# parse_syntax эмпирически проверен (test_ner2.py на сервере) и НЕ используется:
# с ним и без него результаты NER идентичны на всех тестовых примерах, разницы
# во времени тоже нет — тегирование именованных сущностей в natasha не зависит
# от синтаксического дерева. Экономим память/время, не инициализируя NewsSyntaxParser.

app = FastAPI()
segmenter = Segmenter()
emb = NewsEmbedding()
morph_tagger = NewsMorphTagger(emb)
ner_tagger = NewsNERTagger(emb)


class ExtractRequest(BaseModel):
    text: str


@app.post("/extract")
def extract(req: ExtractRequest):
    doc = Doc(req.text)
    doc.segment(segmenter)
    doc.tag_morph(morph_tagger)
    doc.tag_ner(ner_tagger)
    entities = [
        {"type": span.type, "start": span.start, "stop": span.stop, "text": req.text[span.start:span.stop]}
        for span in doc.spans if span.type in ("PER", "LOC")
    ]
    return {"entities": entities}


@app.get("/health")
def health():
    return {"ok": True}
