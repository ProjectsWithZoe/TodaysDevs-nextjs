import axios from 'axios'
import toast  from 'react-hot-toast'

const api = axios.create({
  baseURL:         process.env.NEXT_PUBLIC_API_URL ?? '/api',
  timeout:         10_000,
  withCredentials: true,
})

api.interceptors.response.use(
  response => response,
  error => {
    const silent  = error.config?._silent
    const message = error.response?.data?.message ?? error.message ?? 'Something went wrong'
    if (!silent) {
      console.error('[api]', error.config?.method?.toUpperCase(), error.config?.url, error.response?.status ?? 'network', message)
      toast.error(message)
    }
    return Promise.reject(error)
  }
)

export default api

export const setAccessToken        = () => {}
export const getAccessToken        = () => null
export const setNavigateCallback   = () => {}
export const setTokenExpiredCallback = () => {}
