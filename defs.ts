
import type { LocalDBReaderT } from "./alwaysload/localdb_types.js"

//export type str = string; export type num = number; export type bool = boolean;


export type GenericRowT = { [key:string]: any }

export type LazyloadDependencyT = {
	type: "view" | "component" | "thirdparty"
	name: string
}

// Views, components and thirdparty can each declare dependencies, which load before them.
export type LazyloadT = {
	type: "view" | "component" | "thirdparty"
	urlmatch?: string
	urlmatch_regex?: string
	name: string
	is_instance: boolean
	dependencies: LazyloadDependencyT[] | null
	auth: string[]
	localdb?: string[]
}

export type AppSettingsT = {
	MAIN: {
		INFO: {
			localdb: { name:string, indexes?:string[], auto_increment?:boolean }[]
		}
		LAZYLOADS: LazyloadT[]
	}
	INSTANCE: {
		INFO: {
			name: string
			shortname: string
			firebase: {
				project: string
				identity_platform_key: string
				dbversion: number
			}
			localdb?: { name:string, indexes?:string[], auto_increment?:boolean }[]
			localdb_objectstores?: { name:string, indexes?:string[], auto_increment?:boolean }[]
		}
		LAZYLOADS: LazyloadT[]
	}
}




export type FetchLassieHttpOptsT = {
	method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS",
	headers?: Record<string, string>,
	body?: Record<string, unknown> | unknown[],
	signal?: AbortSignal,
}
export type FetchLassieOptsT = {
	clicklock?: boolean,
	animate?: boolean,
	cacheduration?: number,
	nocache?: boolean,
}
export type FetchResultT = {
	headers: Headers,
	status: number,
	statusText: string,
	ok: boolean,
	data?: number | string | boolean | GenericRowT | Array<GenericRowT|number|string|boolean>
}


export type ViewLoadedDataT = Record<string, unknown>
// What /api/view-data returns, and what a cold load page carries as window.__n2_appcoldload.
export type ViewDataT = { data:ViewLoadedDataT, refreshon:string[] }
export type ViewLoadStateT = 'initial' | 'paramschanged' | 'postload' | 'server_state_change'
export type ViewContextT = {
	loadeddata: ViewLoadedDataT
	pathparams: GenericRowT
	searchparams: GenericRowT
	loadstate: ViewLoadStateT
}

export type ViewT = {
	shadow: ShadowRoot,
	context?: ViewContextT,
	m: {[key:string]:any},
	a: {[key:string]:any},
	s: {[key:string]:any},
	subelshldr?:HTMLElement[]
	opts?: {}
	disconnectedCallback:()=>void,
	attributeChangedCallback:(name:string, oldval:string|boolean|number, newval:string|boolean|number)=>void,
	ingest:()=>void | Promise<void>,
	render:(state_changes?:any)=>void,
	hydrated?:()=>void,
	revealed?:()=>void
}
export type ViewPartT = {
	shadow: ShadowRoot,
	context: ViewContextT,
	ingest:()=>void | Promise<void>,
	render:(state_changes?:any)=>void,
}



export type $NT = {	
	LocalDBSync: LocalDBReaderT
	UpdateOverlayShow: () => void
	FetchLassie: (url:string, http_optsP?:FetchLassieHttpOptsT, optsP?:FetchLassieOptsT) => Promise<FetchResultT>
	SwitchStation: {
		GoTo: (path:string, opts?:{replacestate?:boolean}) => Promise<void>
		GoBack: (opts?:{default?:string}) => Promise<void>
		UpdateViewPart: (part:HTMLElement & ViewPartT) => Promise<void>
	}
}



/*
export type FirestoreOptsT = {
    limit?: number
    order_by?: string,
	ts?: number|null
}
export type FirestoreLoadSpecT    = Map<string, { name:string, opts?:FirestoreOptsT, els?:str[] }>
export type FirestoreFetchResultT = Map<string, Array<object>>|null
*/

// export type SSEventListenerEvents = "datasync_doc_add" | "datasync_doc_delete" | "datasync_doc_patch" | "datasync_collection"
//
// export type EngagementListenerEvents = "visible" | "hidden" | "resize" | "15interval"
//
// export type DataHodlEvents = SSEventListenerEvents | EngagementListenerEvents | 'backonline'
//
// export type EngagementListenerT = {
// 	el: HTMLElement,
//     name: string,
//     type: EngagementListenerEvents[],
// 	priority: number,
//     callback:(s:EngagementListenerEvents)=>void
// }
//
//
// // an action renders either an icon (the default) or a text label; set `text` to get the text label, otherwise set `icon`
// // Unhandled Case: neither icon nor text set — the action renders as an empty hit area.
// export type ViewHeaderActionT = {
// 	key?: string,
// 	icon?: string,
// 	text?: string, // when set, the action renders this label instead of an icon and sizes itself to the text
// 	width?: string, height?: string
// 	icon_wrapper_style?: string,
// 	icon_style?: string,
// 	onClick: () => void,
// }
//
// export type ViewHeaderT = {
// 	title?: string,
// 	backtext?: string,
// 	backurl?: string,
// 	onclose?: () => void, // back and close are mutually exclusive; backurl wins if both are set
// 	actions?: ViewHeaderActionT[],
// 	disable?: boolean,
// 	preserve_title?: boolean,
// 	theme?: 'light' | 'dark',
// }
//
// export type CMechViewT = {
// 	m: {[key:string]:any},
// 	a: {[key:string]:any},
// 	s: {[key:string]:any},
// 	header: ViewHeaderT,
// 	subelshldr?:HTMLElement[]
// 	opts?: {}
// 	disconnectedCallback:()=>void,
// 	attributeChangedCallback:(name:string, oldval:str|boolean|number, newval:string|boolean|number)=>void,
// 	ingest:(loadeddata:CMechLoadedDataT, pathparams:GenericRowT, searchparams:GenericRowT, loadstate:CMechViewLoadStateT)=>void, // loadstate: 'initial' | 'datachanged' | 'paramschanged' | 'searchchanged'
// 	render:(state_changes?:any)=>void,
// 	hydrated?:()=>void,
// 	revealed?:()=>void
// }
// export type CMechViewPartT = {
// 	disconnectedCallback:()=>void,
// 	attributeChangedCallback:(name:string, oldval:str|boolean|number, newval:string|boolean|number)=>void,
// 	m: {[key:string]:any},
// 	a: {[key:string]:any},
// 	s: {[key:string]:any},
// 	ingest:(loadeddata:CMechLoadedDataT, pathparams: GenericRowT, searchparams:GenericRowT, loadstate:CMechViewLoadStateT)=>void, // refer to CMechViewT for loadstate values
// 	render:(state_changes?:any)=>void,
// 	hydrated?:()=>void,
// 	revealed?:()=>void
// }
// export type CMechLoadedDataT = Map<string, GenericRowT[]>
//
// export type ToastLevelT = 'info' | 'saved' | 'success' | 'warning' | 'error'
//
// export type InstallStatusT = 'installed' | 'available' | 'ios_manual' | 'unavailable'
//
//
//
//
//
//
//
// export type $NT = {
// 	SSEvents: {
// 		Add_Listener: (el:HTMLElement, listener_name:string, eventnames:SSEventListenerEvents[], priority:number|null, cb:(e:any, n:SSEventListenerEvents)=>void) => void
// 		Remove_Listener: (el:HTMLElement, name:string)=>void
// 		HandleMessage: (data:any)=>void
// 	},
//
// 	InfluxDB: {
// 		Retrieve_Series: (bucket:str, begins:number[], ends:number[], msrs:str[], fields:str[], tags:str[], intrv:number[]) => Promise<any>
// 	}
//
// 	EngagementListen: {
// 		Init: () => void,
// 		Add_Listener: (el:HTMLElement, name:string, type:EngagementListenerEvents[], priority:number|null, callback:(s:EngagementListenerEvents)=>void) => void
// 		Remove_Listener: (el:HTMLElement, name:string, type:EngagementListenerEvents[]) => void
// 	}
//
// 	DataHodl: {
// 		AddLocalDB:   (pathstr:string, newdocs:GenericRowT) => Promise<any>,
// 		PatchLocalDB: (pathstr:string, data:GenericRowT) => Promise<any>,
// 		DeleteLocalDB:(pathstr:string) => Promise<any>,
// 	}
//
// 	CMech: {
// 		RegisterView: (component:HTMLElement & CMechViewT) => void
// 		RegisterViewPart: (component:HTMLElement & CMechViewPartT) => Promise<void>
// 		PostLoadViewPart: (component:HTMLElement & CMechViewPartT) => Promise<boolean>
// 		AllowPostLoadViewPart: (component:HTMLElement & CMechViewPartT) => Promise<boolean>
// 		AttributeChangedCallback: (component:HTMLElement, name:string, oldval:str|boolean|number|null, newval:string|boolean|number, _opts?:object) => Promise<void>
// 		ViewDisconnectedCallback: (component:HTMLElement) => void
// 		ViewPartDisconnectedCallback: (component:HTMLElement) => void,
// 	}
//
// 	FetchLassie: (url:string, http_optsP?:FetchLassieHttpOptsT|undefined|null, opts?:FetchLassieOptsT|null|undefined) => Promise<FetchResultT>
//
// 	Logger: {
// 		log: (type:number, subject:string, message:str) => void, // refer to logger.ts for type and subject comments
// 		get: () => void
// 	}
//
// 	Utils: {
// 		CSVDownload: (csvstr:string, filename:string) => void,
// 		resolve_object_references: (list: {[key: str]: any}[], object_stores: Map<string, {[key: str]: any}[]>) => {[key: str]: any}[],
// 		setULItemsRowActive: (liel:HTMLElement, autoremove?:boolean) => void,
// 		setWaitingAnimate: (ison:boolean, source_id:string) => void,
// 	}
//
//
// 	ToastShow: (msg: str|{title:string,sub:string}, level: ToastLevelT, duration: num ) => void
// 	Unrecoverable: (subj: string, msg: string, btnmsg:string, logsubj:string, logerrmsg:string, redirectionurl:string|null) => void
// 	GetConnectedState: () => Promise<'online' | 'offline'>
// 	UpdateOverlayShow: () => void
//
// 	Install: {
// 		GetStatus: () => InstallStatusT,
// 		Prompt: () => Promise<'accepted' | 'dismissed' | 'unavailable'>,
// 	}
// 	//GetSharedWorkerPort:() => MessagePort
//
// 	SwitchStation: {
// 		GoTo: (newPath: string, opts?:{replacestate?:boolean}) => void,
// 		GoBack: (opts:{default:str}) => void,
// 	}
//
// 	Header: {
// 		set: (opts: ViewHeaderT) => void,
// 		setTitle: (title?: string, direction?: 'forwards' | 'backwards') => void,
// 		setActions: (actions: ViewHeaderActionT[]) => void,
// 	}
//
// 	IDB: {
// 		GetDB:         () => Promise<IDBDatabase>,
// 		GetOne:        (objectstore_name:str, id:str, localdb_preload?:str[]|null) => Promise<GenericRowT>,
// 		GetAll:        (objectstore_names:str[], localdb_preload?:str[]|null) => Promise<Map<str,GenericRowT[]>>,
// 		GetRangeAll:   (objectstore_names:str[], key:str[], lower_bound:str[]|num[], upper_bound:str[]|num[], localdb_preload?:str[]|null) => Promise<Map<str,GenericRowT[]>>,
// 		ClearAll:      (objectstore_name:str) => Promise<num>,
// 		AddOne:        (objectstore_name:str, data:GenericRowT) => Promise<string>,
// 		PutOne:        (objectstore_name:str, data:GenericRowT) => Promise<string>,
// 		PutMany:       (store_names:str[], datas:GenericRowT[][]) => Promise<string>,
// 		DeleteMany:    (store_names:str[], datas:GenericRowT[][]) => Promise<string>,
// 		DeleteOne:     (objectstore_name:str, id:str) => Promise<string>,
// 		Count:         (objectstore_name:str) => Promise<number>,
// 		GetOne_S:      (objectstore:IDBObjectStore, id:str) => Promise<GenericRowT>,
// 		GetAll_S:      (objectstore:IDBObjectStore) => Promise<GenericRowT[]>,
// 		GetRangeAll_S: (objectstore:IDBObjectStore, key:str[], lower_bound:str[]|num[], upper_bound:str[]|num) => Promise<GenericRowT[]>,
// 		AddOne_S:      (objectstore:IDBObjectStore, data:GenericRowT) => Promise<string>,
// 		PutOne_S:      (objectstore:IDBObjectStore, data:GenericRowT) => Promise<string>,
// 		DeleteOne_S:   (objectstore:IDBObjectStore, id:string) => Promise<string>,
// 		TXResult:      (tx:IDBTransaction) => Promise<num>,
// 		DeleteDatabase:() => Promise<num>
// 	}
// }
//
//
// export type INSTANCE_T = {
// 	INFO: {
// 		name: string,
// 		firebase: {
// 			project: string,
// 			identity_platform_key: string,
// 			dbversion: number,
// 		},
// 		localdb: {name:str,indexes?:str[]}[],
// 	},
// 	LAZYLOADS: LazyLoadT[],
// 	// LAZYLOAD_DATA_FUNCS: { [key:string]: any }
// }
//
//
// export type PRELOAD_BASE_ASSETS_T = '/v/appmsgs' | '/v/login' | '/v/home' | '/';


