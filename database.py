import sqlite3
from datetime import datetime, timedelta
import math
import json

DB_NAME = "questions.db"
LOG_DB_NAME = "action_logs.db"

def get_db_connection():
    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row
    return conn

def get_log_db_connection():
    conn = sqlite3.connect(LOG_DB_NAME)
    conn.row_factory = sqlite3.Row
    return conn

def init_log_db():
    conn = get_log_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            action_type TEXT NOT NULL,
            target_id INTEGER NOT NULL,
            old_data TEXT,
            new_data TEXT,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.commit()
    conn.close()

def add_log(action_type, target_id, old_data=None, new_data=None):
    try:
        conn = get_log_db_connection()
        cursor = conn.cursor()
        old_str = json.dumps(old_data, ensure_ascii=False) if old_data is not None else None
        new_str = json.dumps(new_data, ensure_ascii=False) if new_data is not None else None
        
        cursor.execute("""
            INSERT INTO logs (action_type, target_id, old_data, new_data)
            VALUES (?, ?, ?, ?)
        """, (action_type, target_id, old_str, new_str))
        conn.commit()
        
        cursor.execute("SELECT COUNT(*) FROM logs")
        count = cursor.fetchone()[0]
        if count > 1000:
            limit_to_delete = count - 1000
            cursor.execute("""
                DELETE FROM logs WHERE id IN (
                    SELECT id FROM logs ORDER BY timestamp ASC LIMIT ?
                )
            """, (limit_to_delete,))
            conn.commit()
        conn.close()
    except Exception as e:
        print(f"Logging error: {e}")

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS questions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            question_text TEXT NOT NULL,
            option_a TEXT NOT NULL,
            option_b TEXT NOT NULL,
            option_c TEXT NOT NULL,
            option_d TEXT NOT NULL,
            option_e TEXT NOT NULL,
            correct_option TEXT NOT NULL,
            interval INTEGER DEFAULT 0,
            ease_factor REAL DEFAULT 2.5,
            repetitions INTEGER DEFAULT 0,
            next_review TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.commit()
    
    # Check and add new columns if they do not exist
    cursor.execute("PRAGMA table_info(questions)")
    columns = [row[1] for row in cursor.fetchall()]
    
    if "yil" not in columns:
        cursor.execute("ALTER TABLE questions ADD COLUMN yil TEXT DEFAULT 'final'")
    if "soru_numarasi" not in columns:
        cursor.execute("ALTER TABLE questions ADD COLUMN soru_numarasi INTEGER DEFAULT NULL")
    if "kurul_adi" not in columns:
        cursor.execute("ALTER TABLE questions ADD COLUMN kurul_adi TEXT DEFAULT NULL")
    if "is_archived" not in columns:
        cursor.execute("ALTER TABLE questions ADD COLUMN is_archived INTEGER DEFAULT 0")
        
    conn.commit()
    conn.close()
    
    init_log_db()

def add_question(question_text, option_a, option_b, option_c, option_d, option_e, correct_option, yil='final', soru_numarasi=None, kurul_adi=None):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO questions (
            question_text, option_a, option_b, option_c, option_d, option_e, correct_option, next_review, yil, soru_numarasi, kurul_adi, is_archived
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    """, (
        question_text, option_a, option_b, option_c, option_d, option_e, correct_option,
        datetime.now().strftime("%Y-%m-%d %H:%M:%S"), yil, soru_numarasi, kurul_adi
    ))
    conn.commit()
    question_id = cursor.lastrowid
    
    # Retrieve the added question object to log it
    cursor.execute("SELECT * FROM questions WHERE id = ?", (question_id,))
    row = cursor.fetchone()
    q_dict = dict(row) if row else {}
    conn.close()
    
    add_log('INSERT', question_id, old_data=None, new_data=q_dict)
    return question_id

def get_due_questions(all_questions=False):
    conn = get_db_connection()
    cursor = conn.cursor()
    if all_questions:
        cursor.execute("SELECT * FROM questions WHERE is_archived = 0 ORDER BY next_review ASC")
    else:
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        cursor.execute("""
            SELECT * FROM questions 
            WHERE next_review <= ? AND is_archived = 0
            ORDER BY next_review ASC
        """, (now_str,))
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

def review_question(question_id, rating):
    """
    Update a question's repetition metrics based on user rating.
    rating:
      1 = Incorrect/Forgot
      2..10 = Correct with graded difficulty (10 = Very Easy)
      11 = Do not show again (Archive)
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM questions WHERE id = ?", (question_id,))
    row = cursor.fetchone()
    
    if not row:
        conn.close()
        return False
        
    old_dict = dict(row)
    interval = row["interval"]
    ease_factor = row["ease_factor"]
    repetitions = row["repetitions"]
    is_archived = row["is_archived"]
    
    if rating == 11:
        is_archived = 1
        next_review = datetime.now() + timedelta(days=3650)  # 10 years later
    elif rating == 1:
        repetitions = 0
        interval = 0
        ease_factor = max(1.3, ease_factor - 0.2)
        next_review = datetime.now()
    elif rating >= 2 and rating <= 10:
        repetitions += 1
        if repetitions == 1:
            if rating <= 4:
                interval = 1
            elif rating <= 7:
                interval = 2
            else:
                interval = 3
        elif repetitions == 2:
            if rating <= 4:
                interval = 2
            elif rating <= 7:
                interval = 4
            else:
                interval = 6
        else:
            interval = math.ceil(interval * ease_factor * (rating / 6.0))
        
        ease_factor = max(1.3, min(3.0, ease_factor + (rating - 6) * 0.08))
        next_review = datetime.now() + timedelta(days=interval)
    else:
        conn.close()
        raise ValueError("Invalid rating. Must be between 1 and 11.")
        
    cursor.execute("""
        UPDATE questions
        SET interval = ?, ease_factor = ?, repetitions = ?, next_review = ?, is_archived = ?
        WHERE id = ?
    """, (interval, ease_factor, repetitions, next_review.strftime("%Y-%m-%d %H:%M:%S"), is_archived, question_id))
    conn.commit()
    
    cursor.execute("SELECT * FROM questions WHERE id = ?", (question_id,))
    new_row = cursor.fetchone()
    new_dict = dict(new_row) if new_row else {}
    conn.close()
    
    add_log('REVIEW', question_id, old_data=old_dict, new_data=new_dict)
    
    return {
        "id": question_id,
        "interval": interval,
        "ease_factor": ease_factor,
        "repetitions": repetitions,
        "next_review": next_review.strftime("%Y-%m-%d %H:%M:%S"),
        "is_archived": is_archived
    }

def get_stats():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Total questions
    cursor.execute("SELECT COUNT(*) FROM questions")
    total_questions = cursor.fetchone()[0]
    
    # Due questions
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    cursor.execute("SELECT COUNT(*) FROM questions WHERE next_review <= ?", (now_str,))
    due_questions = cursor.fetchone()[0]
    
    # Average ease factor
    cursor.execute("SELECT AVG(ease_factor) FROM questions")
    avg_ease = cursor.fetchone()[0] or 2.5
    
    conn.close()
    return {
        "total_questions": total_questions,
        "due_questions": due_questions,
        "avg_ease_factor": round(avg_ease, 2)
    }

def get_all_questions():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM questions ORDER BY created_at DESC")
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

def update_question(question_id, question_text, option_a, option_b, option_c, option_d, option_e, correct_option, yil='final', soru_numarasi=None, kurul_adi=None):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM questions WHERE id = ?", (question_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return False
    old_dict = dict(row)
    
    cursor.execute("""
        UPDATE questions
        SET question_text = ?, option_a = ?, option_b = ?, option_c = ?, option_d = ?, option_e = ?, correct_option = ?,
            yil = ?, soru_numarasi = ?, kurul_adi = ?
        WHERE id = ?
    """, (question_text, option_a, option_b, option_c, option_d, option_e, correct_option, yil, soru_numarasi, kurul_adi, question_id))
    rows_affected = cursor.rowcount
    conn.commit()
    
    cursor.execute("SELECT * FROM questions WHERE id = ?", (question_id,))
    new_row = cursor.fetchone()
    new_dict = dict(new_row) if new_row else {}
    conn.close()
    
    if rows_affected > 0:
        add_log('UPDATE', question_id, old_data=old_dict, new_data=new_dict)
    return rows_affected > 0

def delete_question(question_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM questions WHERE id = ?", (question_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return False
    old_dict = dict(row)
    
    cursor.execute("DELETE FROM questions WHERE id = ?", (question_id,))
    rows_affected = cursor.rowcount
    conn.commit()
    conn.close()
    
    if rows_affected > 0:
        add_log('DELETE', question_id, old_data=old_dict, new_data=None)
    return rows_affected > 0

def get_backup_data():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM questions")
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

def restore_backup_data(data_list):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Clear existing questions
    cursor.execute("DELETE FROM questions")
    
    # Insert backup questions with their exact history metrics
    for item in data_list:
        cursor.execute("""
            INSERT INTO questions (
                id, question_text, option_a, option_b, option_c, option_d, option_e, correct_option,
                interval, ease_factor, repetitions, next_review, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            item.get("id"),
            item.get("question_text"),
            item.get("option_a"),
            item.get("option_b"),
            item.get("option_c"),
            item.get("option_d"),
            item.get("option_e"),
            item.get("correct_option"),
            item.get("interval", 0),
            item.get("ease_factor", 2.5),
            item.get("repetitions", 0),
            item.get("next_review"),
            item.get("created_at", datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
        ))
    
    conn.commit()
    conn.close()
    return True

def delete_questions_bulk(question_ids):
    if not question_ids:
        return True
    conn = get_db_connection()
    cursor = conn.cursor()
    placeholders = ",".join("?" for _ in question_ids)
    cursor.execute(f"DELETE FROM questions WHERE id IN ({placeholders})", question_ids)
    conn.commit()
    conn.close()
    return True

def reset_questions_bulk(question_ids):
    if not question_ids:
        return True
    conn = get_db_connection()
    cursor = conn.cursor()
    placeholders = ",".join("?" for _ in question_ids)
    cursor.execute(f"""
        UPDATE questions
        SET interval = 0, ease_factor = 2.5, repetitions = 0, next_review = CURRENT_TIMESTAMP
        WHERE id IN ({placeholders})
    """, question_ids)
    conn.commit()
    conn.close()
    return True

def get_action_logs():
    conn = get_log_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM logs ORDER BY timestamp DESC")
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

def undo_action(log_id):
    conn = get_log_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM logs WHERE id = ?", (log_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return False
        
    log_dict = dict(row)
    action_type = log_dict["action_type"]
    target_id = log_dict["target_id"]
    old_data = json.loads(log_dict["old_data"]) if log_dict["old_data"] else None
    
    db_conn = get_db_connection()
    db_cursor = db_conn.cursor()
    
    success = False
    
    try:
        if action_type == 'INSERT':
            db_cursor.execute("DELETE FROM questions WHERE id = ?", (target_id,))
            db_conn.commit()
            success = True
        elif action_type in ('UPDATE', 'REVIEW'):
            if old_data:
                db_cursor.execute("""
                    UPDATE questions
                    SET question_text = ?, option_a = ?, option_b = ?, option_c = ?, option_d = ?, option_e = ?, correct_option = ?,
                        interval = ?, ease_factor = ?, repetitions = ?, next_review = ?, yil = ?, soru_numarasi = ?, kurul_adi = ?, is_archived = ?
                    WHERE id = ?
                """, (
                    old_data.get("question_text"),
                    old_data.get("option_a"),
                    old_data.get("option_b"),
                    old_data.get("option_c"),
                    old_data.get("option_d"),
                    old_data.get("option_e"),
                    old_data.get("correct_option"),
                    old_data.get("interval"),
                    old_data.get("ease_factor"),
                    old_data.get("repetitions"),
                    old_data.get("next_review"),
                    old_data.get("yil", "final"),
                    old_data.get("soru_numarasi"),
                    old_data.get("kurul_adi"),
                    old_data.get("is_archived", 0),
                    target_id
                ))
                db_conn.commit()
                success = True
        elif action_type == 'DELETE':
            if old_data:
                db_cursor.execute("""
                    INSERT INTO questions (
                        id, question_text, option_a, option_b, option_c, option_d, option_e, correct_option,
                        interval, ease_factor, repetitions, next_review, created_at, yil, soru_numarasi, kurul_adi, is_archived
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    old_data.get("id"),
                    old_data.get("question_text"),
                    old_data.get("option_a"),
                    old_data.get("option_b"),
                    old_data.get("option_c"),
                    old_data.get("option_d"),
                    old_data.get("option_e"),
                    old_data.get("correct_option"),
                    old_data.get("interval", 0),
                    old_data.get("ease_factor", 2.5),
                    old_data.get("repetitions", 0),
                    old_data.get("next_review"),
                    old_data.get("created_at"),
                    old_data.get("yil", "final"),
                    old_data.get("soru_numarasi"),
                    old_data.get("kurul_adi"),
                    old_data.get("is_archived", 0)
                ))
                db_conn.commit()
                success = True
        elif action_type == 'CORRECT_ANSWER':
            if old_data and "correct_option" in old_data:
                db_cursor.execute("""
                    UPDATE questions
                    SET correct_option = ?
                    WHERE id = ?
                """, (old_data["correct_option"], target_id))
                db_conn.commit()
                success = True
                
        if success:
            cursor.execute("DELETE FROM logs WHERE id = ?", (log_id,))
            conn.commit()
            
    except Exception as e:
        print(f"Undo action error: {e}")
        db_conn.rollback()
        success = False
        
    db_conn.close()
    conn.close()
    return success
