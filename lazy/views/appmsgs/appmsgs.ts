




import type { ViewContextT } from "../../../defs.js"

declare var render: any;
declare var html: any;
declare var $N: $NT;



type AttributesT = {
    propa: string,
}

type ModelT = {
	propa: string,
}
type StateT = {
    showlogs: bool,
	showappupdated: bool
	showdatawipe: bool,
	show_gen_logsubj: bool,
	logs: string[],
    logsubj: string,
}




const ATTRIBUTES:AttributesT = { propa: "" }




class VAppMsgs extends HTMLElement {

	m:ModelT = { propa: "" };
	a:AttributesT = { ...ATTRIBUTES };
    s:StateT = {
		showlogs: false,
		showappupdated: false,
		showdatawipe: false,
		show_gen_logsubj: false,
		logs: [],
        logsubj: ""
	}
	header:ViewHeaderT = { title: 'App Messages' }

    shadow:ShadowRoot
	context?:ViewContextT




	static get observedAttributes() { return Object.keys(ATTRIBUTES); }




    constructor() {   

        super(); 
        this.shadow = this.attachShadow({mode: 'open'});
    }




    async connectedCallback() {$N.CMech.RegisterView(this);}




	async attributeChangedCallback(name:string, oldval:string|boolean|number, newval:string|boolean|number) {
		$N.CMech.AttributeChangedCallback(this,name,oldval,newval);
	}




	disconnectedCallback() {   $N.CMech.ViewDisconnectedCallback(this);   }




	static load(_pathparams:GenericRowT, _searchparams:GenericRowT): Promise<LazyLoadFuncReturnT> {
		return new Promise(async (res, _rej) => {
			const d = new Map<str,GenericRowT[]>()
			res({ d, refreshon:[]})
		})
	}




	ingest() {
		const { searchparams } = this.context!

		this.s.logsubj = searchparams.logsubj || ''
		this.s.showappupdated = searchparams.appupdate || false

		if (searchparams.appupdate) {
			this.s.showappupdated = true
		}
		else if (this.s.logsubj === 'ldr') { // data wipe
			this.s.showdatawipe = true
		}
		else if (this.s.logsubj) { // generic
			this.s.show_gen_logsubj = true;
		}
	}




    render() {
        render(this.template(this.s), this.shadow);
    }




	show_logs() {

		const l = localStorage.getItem('logs')
		this.s.logs = l && l.includes('-') ? l.split('-') : [(l || '')]

		this.s.showlogs = true
		this.render();
	}



    template = (_s:StateT) => { return html`{--css--}{--html--}`; }; 

}




customElements.define('v-appmsgs', VAppMsgs);




export {  }


