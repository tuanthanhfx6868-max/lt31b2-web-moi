// api/ocr-roster.js
// Vercel Serverless Function — đọc ảnh danh sách quân số bằng AI (OCR) và trả về dữ liệu dạng JSON
// để trang "Quân số" hiển thị cho người dùng tick chọn dòng cần lấy trước khi lưu.
//
// CÁCH CÀI ĐẶT:
// 1) Đặt file này đúng đường dẫn "api/ocr-roster.js" ở thư mục gốc dự án (ngang hàng với "src", "package.json").
//    Vercel sẽ tự nhận diện và biến nó thành API endpoint tại /api/ocr-roster.
// 2) Vào Vercel Dashboard → dự án này → Settings → Environment Variables, thêm biến:
//       ANTHROPIC_API_KEY = <API key của bạn, lấy tại https://console.anthropic.com/settings/keys>
// 3) Deploy lại (Redeploy) để biến môi trường có hiệu lực.
// 4) Xong — nút "Đọc dữ liệu từ ảnh" trong tab Quân số sẽ hoạt động. Nếu chưa cấu hình, trang web sẽ
//    tự báo rõ cho người dùng biết, không bị lỗi im lặng.
//
// LƯU Ý CHI PHÍ: mỗi lần bấm "Đọc dữ liệu từ ảnh" sẽ tốn một lượt gọi API Anthropic (tính phí theo
// tài khoản API của bạn tại console.anthropic.com — không liên quan đến gói Claude.ai cá nhân).

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Chỉ hỗ trợ POST." });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ notConfigured: true, error: "Chưa cấu hình ANTHROPIC_API_KEY trên máy chủ." });
    return;
  }

  const { imageUrl } = req.body || {};
  if (!imageUrl || typeof imageUrl !== "string") {
    res.status(400).json({ error: "Thiếu imageUrl." });
    return;
  }

  try {
    // Tải ảnh về và chuyển base64 để gửi kèm cho model đọc (Anthropic Messages API nhận ảnh dạng base64).
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) {
      res.status(400).json({ error: "Không tải được ảnh từ đường dẫn đã cho." });
      return;
    }
    const contentType = imgRes.headers.get("content-type") || "image/jpeg";
    const arrayBuffer = await imgRes.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");

    const prompt =
      "Đây là ảnh chụp một danh sách quân số/thành viên (có thể là bảng in, viết tay, hoặc chụp màn hình). " +
      "Hãy đọc và trích xuất TỪNG DÒNG người trong danh sách thành JSON. Với mỗi người, lấy các trường sau " +
      "nếu có trong ảnh (để trống chuỗi rỗng \"\" nếu không thấy, KHÔNG bịa thông tin không có trong ảnh):\n" +
      "- stt: số thứ tự\n" +
      "- msv: mã số (nếu có)\n" +
      "- name: họ và tên đầy đủ\n" +
      "- role: chức vụ (VD: Thành viên, Tiểu đội trưởng...)\n" +
      "- tieuDoi: số tiểu đội (chỉ ghi số, VD \"1\", \"2\")\n" +
      "- dob: ngày sinh, chuyển về dạng yyyy-mm-dd nếu đọc được đủ ngày/tháng/năm, nếu chỉ có năm sinh thì ghi yyyy-01-01\n" +
      "- phone: số điện thoại\n\n" +
      "CHỈ trả lời đúng một JSON object dạng {\"rows\": [ {...}, {...} ]} — không thêm chữ nào khác, " +
      "không thêm ```json hay lời giải thích.";

    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 4000,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: contentType, data: base64 } },
              { type: "text", text: prompt },
            ],
          },
        ],
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      res.status(502).json({ error: `Lỗi gọi API đọc ảnh — ${errText.slice(0, 300)}` });
      return;
    }

    const aiData = await aiRes.json();
    const textBlock = (aiData.content || []).find((b) => b.type === "text");
    const raw = (textBlock?.text || "").trim().replace(/^```json/i, "").replace(/```$/, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      res.status(502).json({ error: "AI trả về dữ liệu không đúng định dạng, thử chụp lại ảnh rõ hơn." });
      return;
    }

    const rows = Array.isArray(parsed?.rows) ? parsed.rows : [];
    res.status(200).json({ rows });
  } catch (err) {
    res.status(500).json({ error: `Đọc ảnh thất bại — ${err?.message || err}` });
  }
}
