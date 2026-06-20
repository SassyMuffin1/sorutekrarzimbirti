import re
import os
import json
import database

class SimilarityCache:
    def __init__(self, app_root_path, turkish_lower_fn):
        self.app_root_path = app_root_path
        self.turkish_lower = turkish_lower_fn
        self.cached_questions = []
        self.db_identifiers = set()
        self.is_loaded = False

    def load_cache(self):
        """Calculates and caches lowercased texts, keywords, and metadata for all questions (DB + JSON)."""
        cached_qs = []
        db_identifiers = set()

        # 1. Load database questions
        try:
            all_db_qs = database.get_all_questions()
            for q in all_db_qs:
                if q.get("is_archived", 0) == 1:
                    continue
                    
                q_kurul = q.get("kurul_adi")
                q_yil = q.get("yil")
                q_num = q.get("soru_numarasi")
                
                if q_kurul and q_yil and q_num is not None:
                    db_identifiers.add((q_kurul, str(q_yil), int(q_num)))

                compare_question = self.turkish_lower(q["question_text"].strip())
                compare_opt_a = self.turkish_lower(q.get("option_a", "").strip())
                compare_opt_b = self.turkish_lower(q.get("option_b", "").strip())
                compare_opt_c = self.turkish_lower(q.get("option_c", "").strip())
                compare_opt_d = self.turkish_lower(q.get("option_d", "").strip())
                compare_opt_e = self.turkish_lower(q.get("option_e", "").strip())
                
                compare_text = f"{compare_question} {compare_opt_a} {compare_opt_b} {compare_opt_c} {compare_opt_d} {compare_opt_e}".strip()
                
                cached_qs.append({
                    "id": q["id"],
                    "question_text": q["question_text"],
                    "option_a": q["option_a"],
                    "option_b": q["option_b"],
                    "option_c": q["option_c"],
                    "option_d": q["option_d"],
                    "option_e": q["option_e"],
                    "correct_option": q["correct_option"],
                    "yil": q_yil or "final",
                    "soru_numarasi": q_num,
                    "kurul_adi": q_kurul,
                    "source": "Veritabanı",
                    
                    # pre-computed cache properties
                    "stem_lower": compare_question,
                    "opts_lower": [compare_opt_a, compare_opt_b, compare_opt_c, compare_opt_d, compare_opt_e],
                    "full_text": compare_text,
                    "keywords": self.extract_keywords(compare_text)
                })
        except Exception as de:
            print(f"Error loading database questions to similarity cache: {de}")

        # 2. Load JSON questions
        json_folders = [
            ("kurul", os.path.join(self.app_root_path, "kurul soruları json format")),
            ("final", os.path.join(self.app_root_path, "final soruları json format"))
        ]
        
        for exam_type, folder_path in json_folders:
            if os.path.exists(folder_path):
                try:
                    files = [f for f in os.listdir(folder_path) if f.endswith(".json")]
                    for filename in files:
                        file_path = os.path.join(folder_path, filename)
                        try:
                            with open(file_path, "r", encoding="utf-8") as f:
                                json_qs = json.load(f)
                            
                            json_kurul = filename.replace("sorular_", "").replace(".json", "")
                            for q in json_qs:
                                q_yil = q.get("yil")
                                q_num = q.get("soru_numarasi")
                                
                                if q_yil is None or q_num is None:
                                    continue
                                    
                                compare_question = self.turkish_lower(q.get("soru_koku", "").strip())
                                secenekler = q.get("secenekler", {})
                                compare_opt_a = self.turkish_lower(secenekler.get("A", "").strip())
                                compare_opt_b = self.turkish_lower(secenekler.get("B", "").strip())
                                compare_opt_c = self.turkish_lower(secenekler.get("C", "").strip())
                                compare_opt_d = self.turkish_lower(secenekler.get("D", "").strip())
                                compare_opt_e = self.turkish_lower(secenekler.get("E", "").strip())
                                
                                compare_text = f"{compare_question} {compare_opt_a} {compare_opt_b} {compare_opt_c} {compare_opt_d} {compare_opt_e}".strip()
                                
                                cached_qs.append({
                                    "id": None,
                                    "question_text": q.get("soru_koku"),
                                    "option_a": secenekler.get("A", ""),
                                    "option_b": secenekler.get("B", ""),
                                    "option_c": secenekler.get("C", ""),
                                    "option_d": secenekler.get("D", ""),
                                    "option_e": secenekler.get("E", ""),
                                    "correct_option": q.get("cevap", ""),
                                    "yil": q_yil,
                                    "soru_numarasi": q_num,
                                    "kurul_adi": json_kurul,
                                    "source": f"JSON: {json_kurul.upper()}",
                                    
                                    # pre-computed cache properties
                                    "stem_lower": compare_question,
                                    "opts_lower": [compare_opt_a, compare_opt_b, compare_opt_c, compare_opt_d, compare_opt_e],
                                    "full_text": compare_text,
                                    "keywords": self.extract_keywords(compare_text)
                                })
                        except Exception as je:
                            print(f"Error reading {filename} for cache: {je}")
                except Exception as fe:
                    print(f"Error reading folder {folder_path} for cache: {fe}")
                        
        self.cached_questions = cached_qs
        self.db_identifiers = db_identifiers
        self.is_loaded = True

    def invalidate(self):
        """Clears the cache and forces reload on next check or reload call."""
        self.is_loaded = False
        self.load_cache()

    def extract_keywords(self, text):
        text_cleaned = re.sub(r'[^\w\s]', ' ', self.turkish_lower(text))
        words = text_cleaned.split()
        stop_words = {
            "aşağıdaki", "aşağıdakilerden", "hangisi", "hangisidir", "yanlıştır", "doğrudur",
            "ile", "ve", "veya", "bir", "en", "olarak", "için", "olan", "de", "da", "bu",
            "ilgili", "hakkında", "tanımlardan", "ifadelerden", "söylenebilir", "söylenemez",
            "ise", "ki", "daha", "çok", "göre", "tanı", "tanısı", "olası", "neden", "olur",
            "yol", "açar", "analiz", "edilmelidir", "edilmemelidir", "arasındaki", "farklar",
            "hakkındaki", "hangisinde", "hangisine", "buna", "göre", "örneğin", "aşağıda",
            "durumlardan", "özelliklerden", "sahiptir", "gösterir", "ilişkilidir", "hangisiyle"
        }
        return {w for w in words if len(w) >= 3 and w not in stop_words}
