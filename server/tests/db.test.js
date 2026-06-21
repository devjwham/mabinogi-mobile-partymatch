// server/tests/db.test.js
require('dotenv').config({ path: '../.env' });
const pool = require('../config/db'); 

describe('MySQL 데이터베이스 연결 테스트', () => {
  afterAll(async () => {
    await pool.end();
  });

  test('DB에 정상적으로 연결되고 핑(Ping)이 가야 한다', async () => {
    const connection = await pool.getConnection();
    
    expect(connection).toBeTruthy();

    const [rows] = await connection.execute('SELECT 1 + 1 AS result');
    expect(rows[0].result).toBe(2);

    connection.release();
  });
});