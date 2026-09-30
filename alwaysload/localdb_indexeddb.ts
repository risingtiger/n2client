import type { LocalDBKeyT, LocalDBOptionsT, LocalDBQueryT, LocalDBRecordT } from "./localdb_types.js"

const LOADED_STORE = "__localdb_loaded"

// Internal sync storage, not the public view API. Only localdb_sync imports this class.
export class LocalDatabase {
	private opening:Promise<IDBDatabase> | undefined

	constructor(private options:LocalDBOptionsT) {}

	Install():Promise<IDBDatabase> {
		if (this.opening) return this.opening

		this.opening = new Promise((resolve, reject) => {
			const request = indexedDB.open(this.options.name, this.options.version)
			request.onupgradeneeded = () => {
				const db = request.result
				if (!db.objectStoreNames.contains(LOADED_STORE)) db.createObjectStore(LOADED_STORE, { keyPath: "id" })
				for (const schema of this.options.stores) {
					const store = db.objectStoreNames.contains(schema.name)
						? request.transaction!.objectStore(schema.name)
						: db.createObjectStore(schema.name, { keyPath: "id" })
					for (const index of schema.indexes ?? []) {
						if (!store.indexNames.contains(index)) store.createIndex(index, index)
					}
				}
			}
			request.onsuccess = () => {
				const db = request.result
				db.onversionchange = () => {
					db.close()
					this.opening = undefined
				}
				resolve(db)
			}
			request.onerror = () => reject(request.error)
			// Unhandled: blocked upgrades require closing older tabs; schema removals/migrations
			// and quota recovery are not implemented. Bump version when adding stores/indexes.
		})
		return this.opening
	}

	async GetOne<T>(store:string, id:LocalDBKeyT):Promise<T | undefined> {
		const db = await this.Install()
		const tx = db.transaction(store, "readonly")
		const [record] = await Promise.all([
			request_result<T | undefined>(tx.objectStore(store).get(id)),
			transaction_done(tx),
		])
		return record
	}

	async ReadMany<T>(queries:LocalDBQueryT[]):Promise<T[][]> {
		if (!queries.length) return []

		const db = await this.Install()
		const tx = db.transaction([...new Set(queries.map(query => query.store))], "readonly")
		// Queue every request synchronously in one transaction, before awaiting anything.
		const requests = queries.map(query => {
			const store = tx.objectStore(query.store)
			const source = query.index ? store.index(query.index) : store
			return request_result<T[]>(source.getAll(query.query, query.count))
		})
		const [records] = await Promise.all([Promise.all(requests), transaction_done(tx)])
		return records
	}

	async IsLoaded(store:string):Promise<boolean> {
		return (await this.GetOne(LOADED_STORE, store)) !== undefined
	}

	async Replace(store:string, records:LocalDBRecordT[]):Promise<void> {
		const db = await this.Install()
		const tx = db.transaction([store, LOADED_STORE], "readwrite")
		const target = tx.objectStore(store)
		target.clear()
		for (const record of records) target.put(record)
		// The completion marker and snapshot commit together, including empty snapshots.
		tx.objectStore(LOADED_STORE).put({ id: store })
		await transaction_done(tx)
	}

	Add(store:string, records:LocalDBRecordT[]):Promise<void> {
		// Server additions are upserts: a snapshot/another tab may already contain the ID.
		return this.Update(store, records)
	}

	Update(store:string, records:LocalDBRecordT[]):Promise<void> {
		return this.write(store, target => {
			for (const record of records) target.put(record)
		})
	}

	Delete(store:string, ids:LocalDBKeyT[]):Promise<void> {
		return this.write(store, target => {
			for (const id of ids) target.delete(id)
		})
	}

	private async write(store:string, enqueue:(target:IDBObjectStore)=>void):Promise<void> {
		const db = await this.Install()
		const tx = db.transaction(store, "readwrite")
		enqueue(tx.objectStore(store))
		await transaction_done(tx)
	}
}

function request_result<T>(request:IDBRequest<T>):Promise<T> {
	return new Promise((resolve, reject) => {
		request.onsuccess = () => resolve(request.result)
		request.onerror = () => reject(request.error)
	})
}

function transaction_done(tx:IDBTransaction):Promise<void> {
	return new Promise((resolve, reject) => {
		tx.oncomplete = () => resolve()
		tx.onabort = () => reject(tx.error ?? new Error("LocalDB transaction aborted"))
		// Request errors abort the transaction by default; never notify views on request success.
	})
}
