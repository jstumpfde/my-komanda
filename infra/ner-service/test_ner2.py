from natasha import Segmenter, NewsEmbedding, NewsMorphTagger, NewsNERTagger, NewsSyntaxParser, Doc
import time

seg = Segmenter()
emb = NewsEmbedding()
mt = NewsMorphTagger(emb)
nt = NewsNERTagger(emb)
sp = NewsSyntaxParser(emb)

texts = {
    "lowercase_no_punct": "ну короче я иван петров звоню по поводу заказа адрес доставки москва улица тверская дом 10 квартира 5 телефон мой 89261234567 а зовут меня иван",
    "capitalized_no_punct": "ну короче я Иван Петров звоню по поводу заказа адрес доставки Москва улица Тверская дом 10 квартира 5 телефон мой 89261234567 а зовут меня Иван",
    "capitalized_with_punct": "Ну короче, я Иван Петров, звоню по поводу заказа. Адрес доставки: Москва, улица Тверская, дом 10, квартира 5. Телефон мой 89261234567, а зовут меня Иван.",
    "realistic_whisper": "да алло здравствуйте это Дмитрий Соколов беспокою вас по поводу договора купли продажи квартиры на улице Кирова дом 22 хотел уточнить сумму сделки и сроки передайте пожалуйста Марии Ивановой что документы готовы",
}

print("=== БЕЗ parse_syntax (только morph+ner) ===")
for name, text in texts.items():
    doc = Doc(text)
    doc.segment(seg)
    doc.tag_morph(mt)
    doc.tag_ner(nt)
    print(name, "->", [(s.type, text[s.start:s.stop]) for s in doc.spans])

print()
print("=== С parse_syntax ===")
for name, text in texts.items():
    doc = Doc(text)
    doc.segment(seg)
    doc.tag_morph(mt)
    doc.parse_syntax(sp)
    doc.tag_ner(nt)
    print(name, "->", [(s.type, text[s.start:s.stop]) for s in doc.spans])

# timing comparison with/without syntax on long text
long_text = (
    "Добрый день! Меня зовут Дмитрий Соколов, я звоню по поводу вашей заявки на кредит. "
    "Скажите, пожалуйста, ваше полное имя и адрес регистрации, чтобы я мог сверить данные в системе. "
) * 15
print()
print("LEN:", len(long_text))

start = time.time()
doc = Doc(long_text)
doc.segment(seg)
doc.tag_morph(mt)
doc.tag_ner(nt)
t1 = time.time() - start
print("БЕЗ syntax:", t1, "sec, entities:", len(doc.spans))

start = time.time()
doc = Doc(long_text)
doc.segment(seg)
doc.tag_morph(mt)
doc.parse_syntax(sp)
doc.tag_ner(nt)
t2 = time.time() - start
print("С syntax:", t2, "sec, entities:", len(doc.spans))
