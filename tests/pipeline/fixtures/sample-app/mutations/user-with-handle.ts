export interface User {
  id: string
  name: string
  handle: string
}

export function createUser(id: string, name: string, handle: string): User {
  return { id, name, handle }
}
