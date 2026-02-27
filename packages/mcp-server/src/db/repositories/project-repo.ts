import { v4 as uuid } from 'uuid';
import { getDb } from '../connection.js';
import type { Project } from '../../types/index.js';
import { generateProjectCode } from '../../utils/code-gen.js';

export class ProjectRepository {
  findAll(): Project[] {
    const db = getDb();
    return db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all() as Project[];
  }

  findById(id: string): Project | undefined {
    const db = getDb();
    return db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Project | undefined;
  }

  findByCode(code: string): Project | undefined {
    const db = getDb();
    return db.prepare('SELECT * FROM projects WHERE code = ?').get(code) as Project | undefined;
  }

  create(data: { name: string; description?: string; github_repo?: string; code?: string }): Project {
    const db = getDb();
    const id = uuid();
    const code = data.code ?? generateProjectCode(data.name);
    let finalCode = code;
    let suffix = 1;
    while (db.prepare('SELECT 1 FROM projects WHERE code = ?').get(finalCode)) {
      if (suffix > 999) throw new Error(`프로젝트 코드를 생성할 수 없습니다: ${data.name}`);
      finalCode = `${code}${suffix++}`;
    }
    db.prepare(
      'INSERT INTO projects (id, name, description, github_repo, code) VALUES (?, ?, ?, ?, ?)'
    ).run(id, data.name, data.description ?? null, data.github_repo ?? null, finalCode);
    return this.findById(id)!;
  }

  update(id: string, data: Partial<Pick<Project, 'name' | 'description' | 'status' | 'github_repo'>>): Project {
    const db = getDb();
    const fields: string[] = [];
    const values: unknown[] = [];
    if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name); }
    if (data.description !== undefined) { fields.push('description = ?'); values.push(data.description); }
    if (data.status !== undefined) { fields.push('status = ?'); values.push(data.status); }
    if (data.github_repo !== undefined) { fields.push('github_repo = ?'); values.push(data.github_repo); }
    fields.push("updated_at = datetime('now')");
    values.push(id);
    db.prepare(`UPDATE projects SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return this.findById(id)!;
  }
}
