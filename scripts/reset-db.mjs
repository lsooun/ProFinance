import fs from 'node:fs';
import path from 'node:path';

const workspace = process.cwd();
const target = path.resolve(workspace, 'data');

if (target !== path.join(workspace, 'data')) {
  throw new Error(`拒绝删除非预期路径：${target}`);
}

if (fs.existsSync(target)) {
  fs.rmSync(target, { recursive: true, force: true });
  console.log(`已删除本地数据目录：${target}`);
} else {
  console.log('本地数据目录不存在，无需清理。');
}

console.log('下次启动服务时会重新创建数据库并写入演示数据。');
