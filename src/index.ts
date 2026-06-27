const CORS_HEADERS: Record<string, string> = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
	'Access-Control-Allow-Headers': '*',
};

class CTFilePublicAPI {
	private headers: Record<string, string>;

	constructor() {
		this.headers = {
			'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
			'Accept': 'application/json, text/javascript, */*; q=0.01',
			'X-Requested-With': 'XMLHttpRequest',
			'Referer': 'https://home.ctfile.com/'
		};
	}

	async getDownloadUrl(fileId: string, passcode?: string | null): Promise<string> {
		// Public, token-free AJAX guest download link endpoint
		const url = `https://home.ctfile.com/iajax.php?item=file&action=download&file_id=${fileId}${passcode ? `&code=${passcode}` : ''}&vcode=`;
		
		const response = await fetch(url, {
			method: 'GET',
			headers: this.headers,
		});

		if (!response.ok) {
			throw new Error(`Public API error: ${response.status}`);
		}

		const data: any = await response.json();
		
		// If the passcode is wrong or missing, data.status will not be 1
		if (data.status !== 1 || !data.file_url) {
			throw new Error(data.message || 'CTFile refused to generate a download link. Verify your passcode.');
		}

		return data.file_url;
	}
}

function extractFileId(xtlink: string): string {
	// Cleans web browser sharing links to isolate individual ID parts
	// Example: https://url83.ctfile.com/d/689183-56168472-bfdf1d -> 56168472-bfdf1d
	const cleaned = xtlink.replace(/https?:\/\/url\d+\.ctfile\.com\/[df]\//, '');
	const mainPart = cleaned.split('?')[0].split('#')[0];
	
	// If it contains a folder prefix like '689183-56168472-bfdf1d', split and get the file hash part
	if (mainPart.includes('-')) {
		const parts = mainPart.split('-');
		if (parts.length >= 2) {
			return `${parts[1]}-${parts[2]}`;
		}
	}
	return mainPart;
}

async function main(request: Request): Promise<Response> {
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
		const api = new CTFilePublicAPI();

		switch (path) {
			case '/download': {
				const xtlink = params.get('xtlink');
				const file_id = params.get('file_id');
				if (!xtlink) {
					return new Response('Missing required parameter: xtlink', { status: 400 });
				}

				// Isolate the file ID hash cleanly
				const targetFileId = file_id || extractFileId(xtlink);
				const directUrl = await api.getDownloadUrl(targetFileId, passcode);
				
				// 302 Redirect directly to the generated public download mirror
				return Response.redirect(directUrl, 302);
			}

			default:
				return new Response('Not Found', { status: 404 });
		}
	} catch (error: any) {
		return new Response(`Bypass Error: ${error.message}`, { status: 500 });
	}
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		if (request.method === 'OPTIONS') {
			return new Response(null, { status: 204, headers: CORS_HEADERS });
		}
		const response = await main(request);
		const headers = new Headers(response.headers);
		for (const [key, value] of Object.entries(CORS_HEADERS)) {
			headers.set(key, value);
		}
		return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
	},
} as ExportedHandler<Env>;
