import Cocoa
import FinderSync

class RuneFinderSync: FIFinderSync {
    override init() {
        super.init()
        // Monitor all directories — menu appears everywhere in Finder
        FIFinderSyncController.default().directoryURLs = [URL(fileURLWithPath: "/")]
    }

    override func menu(for menuKind: FIMenuKind) -> NSMenu {
        let menu = NSMenu(title: "Rune")

        // contextualMenuForContainer = background right-click (empty space)
        // contextualMenuForItems = right-click on selected items
        if menuKind == .contextualMenuForContainer || menuKind == .contextualMenuForItems {
            let item = NSMenuItem(
                title: "New Rune",
                action: #selector(createRune(_:)),
                keyEquivalent: ""
            )
            if #available(macOS 11.0, *) {
                item.image = NSImage(systemSymbolName: "sparkles", accessibilityDescription: "Rune")
            }
            menu.addItem(item)
        }

        return menu
    }

    @objc func createRune(_ sender: AnyObject?) {
        guard let target = FIFinderSyncController.default().targetedURL() else { return }
        let dirPath = target.path

        // Use shell to create .rune file and open it
        let script = """
        cd "\(dirPath)" && \
        /usr/local/bin/rune new agent 2>/dev/null || \
        ~/.rune/create-rune.sh "\(dirPath)" 2>/dev/null
        """

        let task = Process()
        task.executableURL = URL(fileURLWithPath: "/bin/bash")
        task.arguments = ["-c", script]
        try? task.run()
    }
}
