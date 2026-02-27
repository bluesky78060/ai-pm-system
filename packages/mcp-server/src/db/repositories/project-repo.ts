import { v4 as uuid } from 'uuid';
import { getPool } from '../connection.js';
import type { Project } from '../../types/index.js';
import { generateProjectCode } from '../../utils/code-gen.js';

export class ProjectRepository {
  async findAll(): Promise<Project[]> {
    const { rows } = await getPool().query('SELECT * FROM projects ORDER BY created_at DESC');
    return rows as Project[];
  }

  async findById(id: string): Promise<Project | undefined> {
    const { rows } = await getPool().query('SELECT * FROM projects WHERE id = $1', [id]);
    return rows[0] as Project | undefined;
  }

  async findByCode(code: string): Promise<Project | undefined> {
    const { rows } = await getPool().query('SELECT * FROM projects WHERE code = $1', [code]);
    return rows[0] as Project | undefined;
  }

  async create(data: { name: string; description?: string; github_repo?: string; code?: string }): Promise<Project> {
    const pool = getPool();
    const id = uuid();
    const code = data.code ?? generateProjectCode(data.name);
    let finalCode = code;
    let suffix = 1;
    while (true) {
      const { rows } = await pool.query('SELECT 1 FROM projects WHERE code = $1', [finalCode]);
      if (rows.length === 0) break;
      if (suffix > 999) throw new Error(`프로젝트 코드를 생성할 수 없습니다: ${data.name}`);
      finalCode = `${code}${suffix++}`;
    }
    await pool.query(
      'INSERT INTO projects (id, name, description, github_repo, code) VALUES ($1, $2, $3, $4, $5)',
      [id, data.name, data.description ?? null, data.github_repo ?? null, finalCode]
    );
    return (await this.findById(id))!;
  }

  async update(id: string, data: Partial<Pick<Project, 'name' | 'description' | 'status' | 'github_repo'>>): Promise<Project> {
    const pool = getPool();
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;
    if (data.name !== undefined) { fields.push(`name = $${idx++}`); values.push(data.name); }
    if (data.description !== undefined) { fields.push(`description = $${idx++}`); values.push(data.description); }
    if (data.status !== undefined) { fields.push(`status = $${idx++}`); values.push(data.status); }
    if (data.github_repo !== undefined) { fields.push(`github_repo = $${idx++}`); values.push(data.github_repo); }
    fields.push(`updated_at = NOW()`);
    values.push(id);
    await pool.query(`UPDATE projects SET ${fields.join(', ')} WHERE id = $${idx}`, values);
    return (await this.findById(id))!;
  }
}
