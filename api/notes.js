import { createClient } from "@libsql/client";

function makeClient() {
  const url = process.env.TURSO_URL;
  const token = process.env.TURSO_TOKEN;
  if (!url || !token) return null;
  return createClient({ url: url.trim(), authToken: token.trim() });
}

function json(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}

export default async function handler(req, res) {
  const client = makeClient();
  const access = process.env.ACCESS_CODE;

  if (!client) return json(res, 500, { error: "Env TURSO_URL/TURSO_TOKEN belum di-set." });
  if (!access) return json(res, 500, { error: "Env ACCESS_CODE belum di-set." });

  const provided = req.headers["x-access-code"];
  if (provided !== access) return json(res, 401, { error: "Kode akses salah!" });

  try {
    // GET /api/notes -> list
    // GET /api/notes?id=1 -> detail
    if (req.method === "GET") {
      const { id } = req.query || {};
      if (id) {
        const r = await client.execute({
          sql: "SELECT id, title, event_date, content FROM notes WHERE id = ?",
          args: [id]
        });
        if (!r.rows || r.rows.length === 0) return json(res, 404, { error: "Catatan tidak ditemukan." });
        return json(res, 200, r.rows[0]);
      }

      const result = await client.execute(
        "SELECT id, title, event_date, content FROM notes ORDER BY event_date DESC, id DESC"
      );
      return json(res, 200, result.rows || []);
    }

    // POST body: { id?, title, date, content }
    if (req.method === "POST") {
      const { id, title, date, content } = req.body || {};
      if (!title || !date || !content) {
        return json(res, 400, { error: "Data tidak lengkap (title, date, content wajib)." });
      }

      if (id) {
        await client.execute({
          sql: "UPDATE notes SET title = ?, event_date = ?, content = ? WHERE id = ?",
          args: [title, date, content, id]
        });
        return json(res, 200, { message: "Update berhasil" });
      }

      await client.execute({
        sql: "INSERT INTO notes (title, event_date, content) VALUES (?, ?, ?)",
        args: [title, date, content]
      });
      return json(res, 201, { message: "Simpan berhasil" });
    }

    // DELETE /api/notes?id=1
    if (req.method === "DELETE") {
      const { id } = req.query || {};
      if (!id) return json(res, 400, { error: "Query id wajib." });

      await client.execute({
        sql: "DELETE FROM notes WHERE id = ?",
        args: [id]
      });
      return json(res, 200, { message: "Hapus berhasil" });
    }

    res.setHeader("Allow", "GET, POST, DELETE");
    return json(res, 405, { error: "Method tidak diizinkan." });
  } catch (error) {
    return json(res, 500, { error: "Database error", details: error?.message || String(error) });
  }
}
