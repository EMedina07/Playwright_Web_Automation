import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import FormData from 'form-data';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

export function createJiraClient(baseUrl: string, email: string, apiToken: string): AxiosInstance {
  const token = Buffer.from(`${email}:${apiToken}`).toString('base64');
  const instance = axios.create({
    baseURL: `${baseUrl.replace(/\/+$/, '')}/rest/api/3`,
    headers: {
      Authorization: `Basic ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    timeout: 30_000,
  });

  instance.interceptors.response.use(
    (res) => res,
    async (error) => {
      const config = error.config as AxiosRequestConfig & { _retryCount?: number };
      const status: number = error.response?.status ?? 0;

      if (!isRetryable(status)) throw error;

      config._retryCount = (config._retryCount ?? 0) + 1;
      if (config._retryCount > MAX_RETRIES) throw error;

      await sleep(RETRY_DELAY_MS * config._retryCount);
      return instance(config);
    },
  );

  return instance;
}

export async function postJson<T>(
  client: AxiosInstance,
  url: string,
  body: unknown,
): Promise<AxiosResponse<T>> {
  return client.post<T>(url, body);
}

export async function putJson<T>(
  client: AxiosInstance,
  url: string,
  body: unknown,
): Promise<AxiosResponse<T>> {
  return client.put<T>(url, body);
}

export async function getJson<T>(
  client: AxiosInstance,
  url: string,
): Promise<AxiosResponse<T>> {
  return client.get<T>(url);
}

export async function postFormData<T>(
  client: AxiosInstance,
  url: string,
  form: FormData,
): Promise<AxiosResponse<T>> {
  return client.post<T>(url, form, {
    headers: {
      ...form.getHeaders(),
      'X-Atlassian-Token': 'no-check',
    },
  });
}
