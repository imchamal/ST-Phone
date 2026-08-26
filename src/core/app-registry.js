const PHONE_APPS = Object.freeze([
    {
        id: 'contacts',
        name: 'Contacts',
        icon: 'fa-address-book',
        color: '#efb14e',
        location: 'grid',
    },
    {
        id: 'gallery',
        name: 'Gallery',
        icon: 'fa-images',
        color: '#d36da5',
        location: 'grid',
    },
    {
        id: 'notes',
        name: 'Notes',
        icon: 'fa-note-sticky',
        color: '#e4c54c',
        location: 'grid',
    },
    {
        id: 'phone',
        name: 'Phone',
        icon: 'fa-phone',
        color: '#57b66b',
        location: 'dock',
    },
    {
        id: 'messages',
        name: 'Messages',
        icon: 'fa-comment',
        color: '#5bbf72',
        location: 'dock',
    },
]);

/**
 * Returns fresh app definitions so consumers cannot mutate the registry.
 */
export function getPhoneApps() {
    return PHONE_APPS.map((app) => ({ ...app }));
}
