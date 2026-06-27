import { TOKENS } from './token';

const CORS_HEADERS: Record<string, string> = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
	'Access-Control-Allow-Headers': '*',
};

class CTFileWebAPI {
	private headers: Record<string, string>;

	constructor(cookieString: string) {
		this.headers = {
			'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
			'Accept': 'application/json, text/javascript, */*; q=0.01',
			'X-Requested-With': 'XMLHttpRequest',
			// Pass the full combined cookie string from your browser session
			'Cookie': cookieString
		};
	}

	async listFiles(folderId: string): Promise<Array<{ key: string; name: string }>> {
		const url = `https://home.ctfile.com/iajax.php?item=file_act&action=file_list&folder_id=${folderId}&task=index&sEcho=1&iDisplayStart=0&iDisplayLength=100`;
		
		const response = await fetch(url, {
			method: 'GET',
			headers: this.headers,
		});

		if (!response.ok) {
			throw new Error(`Web listing error: ${response.status}`);
		}

		const contentType = response.headers.get('content-type') || '';
		if (!contentType.includes('application/json')) {
			const textSample = await response.text();
			throw new Error(`Server returned HTML instead of JSON. Your session token/cookies might be expired or invalid. (Sample: ${textSample.slice(0, 100)})`);
		}

		const data: any = await response.json();
		const items = data.aaData || [];
		
		return items.map((item: any) => ({
			key: item[0], // File or folder ID
			name: item[1]?.replace(/<[^>]*>/g, '') || 'Unnamed File' // Strip HTML tags around names
		}));
	}

	async getDownloadUrl(fileId: string, passcode?: string | null): Promise<string> {
		const url = `https://home.ctfile.com/iajax.php?item=download&action=download_link&file_id=${fileId}${passcode ? `&code=${passcode}` : ''}`;
		
		const response = await fetch(url, {
			method: 'GET',
			headers: this.headers,
		});

		if (!response.ok) {
			throw new Error(`Web link resolution error: ${response.status}`);
		}

		const contentType = response.headers.get('content-type') || '';
		if (!contentType.includes('application/json')) {
			throw new Error(`Server returned HTML instead of JSON. Your session token/cookies might be expired or invalid.`);
		}

		const data: any = await response.json();
		
		if (data.status !== 1 || !data.file_url) {
			throw new Error(data.message || 'Upstream server refused link creation.');
		}

		return data.file_url;
	}
}

function extractFolderOrFileId(xtlink: string): { id: string } {
	// Cleans web browser sharing links to isolate individual ID parts
	const cleaned = xtlink.replace(/https?:\/\/url\d+\.ctfile\.com\/[df]\//, '');
	const mainPart = cleaned.split('?')[0].split('#')[0];
	return { id: mainPart };
}

async function main(request: Request, env: Env): Promise<Response> {
	if (request.method !== 'GET') {
		return new Response('Method Not Allowed', { status: 405 });
	}

	try {
		const url = new URL(request.url);
		const params = url.searchParams;
		const path = url.pathname;

		if (path === '/meow') {
			return new Response('Meow!', { status: 200 });
		}

		const passcode = params.get('passcode') || params.get('password');
		
		// Grabs the complete authentication cookie string from token.ts
		const cookieToken = params.get('token') || (Array.isArray(TOKENS) ? TOKENS[0] : null);
		if (!cookieToken) {
			return new Response('Missing active session identification token.', { status: 400 });
		}

		const api = new CTFileWebAPI(cookieToken);

		switch (path) {
			case '/download': {
				const xtlink = params.get('xtlink');
				const file_id = params.get('file_id');
				if (!xtlink) {
					return new Response('Missing required parameter: xtlink', { status: 400 });
				}

				const targetFileId = file_id || extractFolderOrFileId(xtlink).id;
				const directUrl = await api.getDownloadUrl(targetFileId, passcode);
				
				return Response.redirect(directUrl, 302);
			}

			case '/download_info': {
				const xtlink = params.get('xtlink');
				if (!xtlink) {
					return new Response('Missing required parameter: xtlink', { status: 400 });
				}

				const parsed = extractFolderOrFileId(xtlink);
				const files = await api.listFiles(parsed.id);

				// If download=true query parameter is present, map high-speed direct locations
				if (params.get('download') === 'true') {
					const highSpeedResults = await Promise.all(
						files.map(async (f) => {
							try {
								const dlUrl = await api.getDownloadUrl(f.key, passcode);
								return { ...f, downloadUrl: dlUrl };
							} catch {
								return { ...f, downloadUrl: null };
							}
						})
					);
					return new Response(JSON.stringify(highSpeedResults), { status: 200, headers: { 'Content-Type': 'application/json' } });
				}

				return new Response(JSON.stringify(files), {
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				});
			}

			default:
				return new Response('Not Found', { status: 404 });
		}
	} catch (error: any) {
		return new Response(`Internal Web App Server Error: ${error.message}`, { status: 500 });
	}
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		if (request.method === 'OPTIONS') {
			return new Response(null, { status: 204, headers: CORS_HEADERS });
		}
		const response = await main(request, env);
		const headers = new Headers(response.headers);
		for (const [key, value] of Object.entries(CORS_HEADERS)) {
			headers.set(key, value);
		}
		return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
	},
} as ExportedHandler<Env>;
