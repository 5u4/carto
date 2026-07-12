import type { User } from './user.js'
import type { Post } from './post.js'

export interface FeedEntry {
  title: string
  author: string
}

export function buildFeed(posts: Post[], users: User[]): FeedEntry[] {
  const byId = new Map(users.map((user) => [user.id, user]))
  return posts.map((post) => ({
    title: post.title,
    author: byId.get(post.authorId)?.name ?? 'unknown'
  }))
}
