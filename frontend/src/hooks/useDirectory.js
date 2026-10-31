import { useEffect, useState } from 'react';
import * as usersApi from '../api/users';
import * as projectsApi from '../api/projects';

// Shared, cached lookups for pickers (people, projects). Cached per page
// load; `refresh()` forces a reload after edits.
let usersCache = null;
let projectsCache = null;

export function useUsers() {
  const [users, setUsers] = useState(usersCache || []);
  const refresh = async () => {
    usersCache = await usersApi.listUsers();
    setUsers(usersCache);
    return usersCache;
  };
  useEffect(() => {
    if (!usersCache) refresh().catch(() => {});
  }, []);
  return { users, refresh };
}

export function useProjects() {
  const [projects, setProjects] = useState(projectsCache || []);
  const refresh = async () => {
    projectsCache = await projectsApi.listProjects({ status: 'active' });
    setProjects(projectsCache);
    return projectsCache;
  };
  useEffect(() => {
    if (!projectsCache) refresh().catch(() => {});
  }, []);
  return { projects, refresh };
}

export function invalidateDirectory() {
  usersCache = null;
  projectsCache = null;
}
