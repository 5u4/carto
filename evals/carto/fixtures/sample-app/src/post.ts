import type { User } from './user.js'

export interface Post {
  id: string
  authorId: string
  title: string
}

export function createPost(id: string, author: User, title: string): Post {
  return { id, authorId: author.id, title }
}
