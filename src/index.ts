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
			throw new Error(`Server returned HTML instead of JSON. Your session token might be expired. (Sample: ${textSample.slice(0, 100)})`);
		}

		const data: any = await response.json();
		const items = data.aaData || [];
		
		return items.map((item: any) => ({
			key: item[0],
			name: item[1]?.replace(/<[^>]*>/g, '') || 'Unnamed File'
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
			throw new Error(`Server returned HTML instead of JSON. Your session token might be expired.`);
		}

		const data: any = await response.json();
		
		if (data.status !== 1 || !data.file_url) {
			throw new Error(data.message || 'Upstream server refused link creation.');
		}

		return data.file_url;
	}
