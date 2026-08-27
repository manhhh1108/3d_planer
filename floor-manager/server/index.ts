import dotenv from 'dotenv';
dotenv.config();

const { default: app } = await import('./app.js');
const { recoverStuckAssets } = await import('./cad/convert.js');
const { convertQueue } = await import('./cad/convertQueue.js');

// Job convert dở dang từ lần chạy trước: chạy lại thay vì bắt upload lại.
const retry = await recoverStuckAssets();
retry.forEach((id) => convertQueue.enqueue(id));
if (retry.length > 0) {
  console.log(`Đưa lại ${retry.length} file CAD vào hàng đợi convert`);
}

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
