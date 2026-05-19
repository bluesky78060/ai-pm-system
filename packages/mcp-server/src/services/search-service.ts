import { TaskRepository } from '../db/repositories/task-repo.js';
import { SavedSearchRepository, type SearchFilters, type SavedSearch } from '../db/repositories/saved-search-repo.js';
import type { Task } from '../types/index.js';
import { getPool } from '../db/connection.js';

const taskRepo = new TaskRepository();
const savedSearchRepo = new SavedSearchRepository();

/**
 * Escape special characters in LIKE patterns to prevent injection
 * @param str - String to escape
 * @returns Escaped string safe for LIKE queries
 */
function escapeLikePattern(str: string): string {
  return str.replace(/[%_\\]/g, '\\$&');
}

export class SearchService {
  /**
   * Search tasks with full-text search and multiple filters
   * @param query - Search term (searches title and description)
   * @param filters - Optional filters: status[], assignee[], epic_id[], priority[], date_range
   */
  async searchTasks(query: string, filters?: SearchFilters): Promise<Task[]> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    // Full-text search on title and description (case-insensitive)
    if (query && query.trim().length > 0) {
      conditions.push(`(title ILIKE $${idx} ESCAPE '\\' OR description ILIKE $${idx} ESCAPE '\\')`);
      values.push(`%${escapeLikePattern(query.trim())}%`);
      idx++;
    }

    // Status filter (array)
    if (filters?.status && filters.status.length > 0) {
      conditions.push(`status = ANY($${idx}::text[])`);
      values.push(filters.status);
      idx++;
    }

    // Assignee filter (array)
    if (filters?.assignee && filters.assignee.length > 0) {
      conditions.push(`assignee = ANY($${idx}::text[])`);
      values.push(filters.assignee);
      idx++;
    }

    // Epic ID filter (array)
    if (filters?.epic_id && filters.epic_id.length > 0) {
      conditions.push(`epic_id = ANY($${idx}::text[])`);
      values.push(filters.epic_id);
      idx++;
    }

    // Priority filter (array)
    if (filters?.priority && filters.priority.length > 0) {
      conditions.push(`priority = ANY($${idx}::int[])`);
      values.push(filters.priority);
      idx++;
    }

    // Date range filter (created_at and completed_at)
    if (filters?.date_range) {
      if (filters.date_range.start) {
        conditions.push(`(created_at >= $${idx} OR completed_at >= $${idx})`);
        values.push(filters.date_range.start);
        idx++;
      }
      if (filters.date_range.end) {
        conditions.push(`(created_at <= $${idx} OR completed_at <= $${idx})`);
        values.push(filters.date_range.end);
        idx++;
      }
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const sql = `SELECT * FROM tasks ${where} ORDER BY priority DESC, created_at DESC`;

    const { rows } = await getPool().query(sql, values);
    return rows as Task[];
  }

  /**
   * Save a search query for future use
   */
  async saveSearch(
    userId: string,
    name: string,
    query: string,
    filters?: SearchFilters
  ): Promise<SavedSearch> {
    if (!userId || userId.trim().length === 0) {
      throw new Error('user_id는 필수입니다');
    }
    if (!name || name.trim().length === 0) {
      throw new Error('검색 이름은 필수입니다');
    }

    return savedSearchRepo.create({ user_id: userId, name, query, filters });
  }

  /**
   * Get all saved searches for a user
   */
  async getSavedSearches(userId: string): Promise<SavedSearch[]> {
    if (!userId || userId.trim().length === 0) {
      throw new Error('user_id는 필수입니다');
    }
    return savedSearchRepo.findByUser(userId);
  }

  /**
   * Delete a saved search
   */
  async deleteSavedSearch(searchId: string): Promise<void> {
    const search = await savedSearchRepo.findById(searchId);
    if (!search) {
      console.error(`[SearchService] Saved search not found: ${searchId}`);
      throw new Error('저장된 검색을 찾을 수 없습니다');
    }
    await savedSearchRepo.delete(searchId);
  }
}
