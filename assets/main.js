document.addEventListener('DOMContentLoaded', function() {
    var links = document.links;
    for (var i = 0; i < links.length; i++) {
        if(links[i].href && links[i].href.includes("//")) {
            links[i].target = "_blank";
            links[i].rel = "noopener"
        }
    }
}, false);
