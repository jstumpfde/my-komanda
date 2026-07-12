from natasha import Segmenter, NewsEmbedding, NewsMorphTagger, NewsNERTagger, Doc
import time

seg = Segmenter()
emb = NewsEmbedding()
mt = NewsMorphTagger(emb)
nt = NewsNERTagger(emb)

texts = [
    "Добрый день, это Мария из компании Орлинк, хотела уточнить по сделке.",
    # разговорный whisper-стиль без знаков препинания
    "ну короче я иван петров звоню по поводу заказа адрес доставки москва улица тверская дом 10 квартира 5 телефон мой 89261234567 а зовут меня иван",
]

for text in texts:
    doc = Doc(text)
    doc.segment(seg)
    doc.tag_morph(mt)
    doc.tag_ner(nt)
    print("TEXT:", text)
    for span in doc.spans:
        print(" ", span.type, repr(text[span.start:span.stop]))
    print()

# timing test on ~2500 char text
long_text = (
    "Добрый день! Меня зовут Дмитрий Соколов, я звоню по поводу вашей заявки на кредит. "
    "Скажите, пожалуйста, ваше полное имя и адрес регистрации, чтобы я мог сверить данные в системе. "
) * 15
print("LEN:", len(long_text))
start = time.time()
doc = Doc(long_text)
doc.segment(seg)
doc.tag_morph(mt)
doc.tag_ner(nt)
elapsed = time.time() - start
print("TIME (morph+ner, no syntax):", elapsed, "sec, entities found:", len(doc.spans))
