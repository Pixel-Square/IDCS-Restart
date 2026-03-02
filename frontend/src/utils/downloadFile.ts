/**
 * Download an Excel file from the given URL
 * @param url - The API endpoint URL
 * @param filename - The desired filename for the downloaded file
 * @param fetchWithAuth - The authenticated fetch function
 */
export async function downloadExcel(
  url: string,
  filename: string,
  fetchWithAuth: (url: string, options?: RequestInit) => Promise<Response>
): Promise<void> {
  try {
    const response = await fetchWithAuth(url, {
      method: 'GET',
    });

    if (!response.ok) {
      throw new Error(`Failed to download: ${response.statusText}`);
    }

    const blob = await response.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(downloadUrl);
  } catch (error) {
    console.error('Download error:', error);
    throw error;
  }
}

/**
 * Download a CSV file from the given URL
 * @param url - The API endpoint URL
 * @param filename - The desired filename for the downloaded file
 * @param fetchWithAuth - The authenticated fetch function
 */
export async function downloadCSV(
  url: string,
  filename: string,
  fetchWithAuth: (url: string, options?: RequestInit) => Promise<Response>
): Promise<void> {
  try {
    const response = await fetchWithAuth(url, {
      method: 'GET',
    });

    if (!response.ok) {
      throw new Error(`Failed to download: ${response.statusText}`);
    }

    const blob = await response.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(downloadUrl);
  } catch (error) {
    console.error('Download error:', error);
    throw error;
  }
}
