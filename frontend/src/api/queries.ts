import { QueryClient, useMutation, useQuery } from '@tanstack/react-query'
import { api, isNotFound } from './client'

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Content only changes on deploy, so fetch each resource once per visit.
        staleTime: Infinity,
        retry: (failureCount, error) => !isNotFound(error) && failureCount < 2,
      },
    },
  })
}

export const useSite = () => useQuery({ queryKey: ['site'], queryFn: api.site })

export const useProjects = () =>
  useQuery({ queryKey: ['projects'], queryFn: api.projects })

export const useProject = (slug: string) =>
  useQuery({ queryKey: ['project', slug], queryFn: () => api.project(slug) })

export const useResume = () =>
  useQuery({ queryKey: ['resume'], queryFn: api.resume })

export const usePhotos = () =>
  useQuery({ queryKey: ['photos'], queryFn: api.photos })

export const useSendContact = () => useMutation({ mutationFn: api.contact })
