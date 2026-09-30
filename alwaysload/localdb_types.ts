export type LocalDBKeyT = string | number
export type LocalDBRecordT = { id:LocalDBKeyT, [key:string]:unknown }
export type LocalDBStoreT = { name:string, indexes?:string[] }
export type LocalDBOptionsT = { name:string, version:number, stores:LocalDBStoreT[] }

export type LocalDBQueryT = {
	store:string
	index?:string
	query?:IDBValidKey | IDBKeyRange
	count?:number
}

// Wire protocol: keep in sync with n2server/src/localdb_sync.ts.
// Updates contain complete records, never patches. Deletes carry only keys.
export type LocalDBChangeT = { store:string, revision:number } & (
	{ operation:"add" | "update", records:LocalDBRecordT[] }
	| { operation:"delete", ids:LocalDBKeyT[] }
)
export type LocalDBSnapshotT = { store:string, revision:number, records:LocalDBRecordT[] }

export type LocalDBReaderT = {
	GetOne:<T extends LocalDBRecordT = LocalDBRecordT>(path:string, id?:LocalDBKeyT) => Promise<T | undefined>
	GetAll:<T extends LocalDBRecordT = LocalDBRecordT>(store:string) => Promise<T[]>
	ReadMany:<T extends LocalDBRecordT = LocalDBRecordT>(queries:LocalDBQueryT[]) => Promise<T[][]>
}
