document.addEventListener('DOMContentLoaded', function() {
    var links = document.links;
    for (var i = 0; i < links.length; i++) {
        if(links[i].href && !links[i].href.includes(document.domain)) {
            links[i].target = "_blank";
            links[i].rel = "noopener"
        }
    }
    var list = document.querySelectorAll('.darkreader');
    for(var i =0;i < list.length;i++){
        list[i].innerText='';
    }
}, false);
